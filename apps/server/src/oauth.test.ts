import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, expect, test, vi } from "vitest";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { openDatabase } from "./db.js";

const allowed = "123456789012345678";
const denied = "223456789012345678";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function fixture(id = allowed, failure = false) {
  const provider = Fastify({ logger: false });
  let calls = 0;
  let challenge = "";
  provider.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => done(null, new URLSearchParams(body as string)),
  );
  provider.post("/api/oauth2/token", async (request, reply) => {
    calls++;
    const body = request.body as URLSearchParams;
    expect(body.get("client_secret")).toBe("fixture-secret");
    expect(body.get("redirect_uri")).toBe(
      "https://embed.example/api/auth/discord/callback",
    );
    expect(
      createHash("sha256")
        .update(body.get("code_verifier")!)
        .digest("base64url"),
    ).toBe(challenge);
    if (failure)
      return reply
        .code(400)
        .send({ error: "fixture-access fixture-refresh fixture-secret" });
    return { access_token: "fixture-access", refresh_token: "fixture-refresh" };
  });
  provider.get("/api/users/@me", async (request) => {
    expect(request.headers.authorization).toBe("Bearer fixture-access");
    return {
      id,
      username: "writer",
      global_name: "Team writer",
      avatar: "a".repeat(32),
    };
  });
  await provider.listen({ port: 0, host: "127.0.0.1" });
  const dir = mkdtempSync(join(tmpdir(), "embed-oauth-"));
  const logs: string[] = [];
  const app = await createApp(
    readConfig({
      BOT_TOKEN: "fixture-bot",
      AUTH_MODE: "discord",
      DISCORD_CLIENT_ID: allowed,
      DISCORD_CLIENT_SECRET: "fixture-secret",
      PUBLIC_URL: "https://embed.example",
      ALLOWED_USER_IDS: allowed,
      DATA_DIR: dir,
      DISCORD_API_BASE: `${provider.listeningOrigin}/api`,
    }),
    {
      logger: {
        stream: {
          write: (line: string) => {
            logs.push(line);
          },
        },
      },
    },
  );
  cleanups.push(async () => {
    await app.close();
    await provider.close();
    rmSync(dir, { recursive: true });
  });
  async function start() {
    const response = await app.inject("/api/auth/discord");
    const url = new URL(response.headers.location!);
    expect(url.searchParams.get("scope")).toBe("identify");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    challenge = url.searchParams.get("code_challenge")!;
    const cookie = response.cookies.find((c) => c.name === "embed_oauth")!;
    expect(cookie.httpOnly).toBe(true);
    return {
      state: url.searchParams.get("state")!,
      cookie: `${cookie.name}=${cookie.value}`,
    };
  }
  const callback = (
    state?: string,
    cookie?: string,
    extra = "&code=fixture-code",
  ) =>
    app.inject({
      url: `/api/auth/discord/callback?${state === undefined ? "" : `state=${state}`}${extra}`,
      headers: {
        ...(cookie ? { cookie } : {}),
        "sec-fetch-site": "cross-site",
        referer: "https://discord.com/",
      },
    });
  return { app, dir, logs, start, callback, calls: () => calls };
}
test("allowed identity creates a private session, rotates and logs out without retaining provider tokens", async () => {
  const f = await fixture();
  const transaction = await f.start();
  const result = await f.callback(transaction.state, transaction.cookie);
  expect(result.headers.location).toBe("/");
  const cookie = result.cookies.find((c) => c.name === "embed_session")!;
  const headers = { cookie: `${cookie.name}=${cookie.value}` };
  const session = (await f.app.inject({ url: "/api/session", headers })).json();
  expect(session).toMatchObject({
    authenticated: true,
    user: {
      id: allowed,
      name: "Team writer",
      avatar: expect.stringContaining("cdn.discordapp.com"),
    },
  });
  const db = openDatabase(f.dir);
  const rows = JSON.stringify(db.prepare("SELECT * FROM sessions").all());
  db.close();
  for (const secret of [
    "fixture-access",
    "fixture-refresh",
    "fixture-secret",
    cookie.value,
  ]) {
    expect(rows).not.toContain(secret);
    expect(f.logs.join("")).not.toContain(secret);
    expect(JSON.stringify(session)).not.toContain(secret);
    expect(
      readFileSync(join(f.dir, "embed-dash.db")).includes(Buffer.from(secret)),
    ).toBe(false);
  }
  expect(
    (await f.callback(transaction.state, transaction.cookie)).headers.location,
  ).toBe("/login?oauth=state");
  expect(f.calls()).toBe(1);
  expect(
    (await f.app.inject({ method: "POST", url: "/api/auth/logout", headers }))
      .statusCode,
  ).toBe(403);
  expect(
    (
      await f.app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: {
          ...headers,
          origin: "https://embed.example",
          "x-csrf-token": session.csrfToken,
        },
      })
    ).statusCode,
  ).toBe(200);
  expect((await f.app.inject({ url: "/api/bot", headers })).statusCode).toBe(
    401,
  );
});
test("blocked identity receives its ID and no session", async () => {
  const f = await fixture(denied);
  const t = await f.start();
  const result = await f.callback(t.state, t.cookie);
  expect(result.headers.location).toBe(`/login?denied=${denied}`);
  expect(result.cookies.some((c) => c.name === "embed_session")).toBe(false);
  expect((await f.app.inject("/api/bot")).statusCode).toBe(401);
});
test.each(["missing", "bad", "other-browser", "expired"])(
  "rejects %s state before exchanging a code",
  async (kind) => {
    const f = await fixture();
    const t = await f.start();
    if (kind === "expired") {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now + 300_001);
    }
    const result = await f.callback(
      kind === "missing" ? undefined : kind === "bad" ? "bad" : t.state,
      kind === "other-browser" ? undefined : t.cookie,
    );
    expect(result.headers.location).toBe("/login?oauth=state");
    expect(f.calls()).toBe(0);
  },
);
test("cancelled and upstream failures are safe and consume state", async () => {
  const f = await fixture(allowed, true);
  let t = await f.start();
  expect(
    (await f.callback(t.state, t.cookie, "&error=access_denied")).headers
      .location,
  ).toBe("/login?oauth=cancelled");
  t = await f.start();
  expect((await f.callback(t.state, t.cookie)).headers.location).toBe(
    "/login?oauth=failed",
  );
  expect(f.logs.join("")).not.toMatch(
    /fixture-access|fixture-refresh|fixture-secret|fixture-code/,
  );
});
