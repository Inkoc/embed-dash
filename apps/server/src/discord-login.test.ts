import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import type { Config } from "./config.js";

const allowedUser = {
  id: "111111111111111111",
  username: "ada",
  global_name: "Ada Lovelace",
  avatar: "0123456789abcdef0123456789abcdef",
};
const blockedUser = { ...allowedUser, id: "222222222222222222", avatar: null };
const accessToken = "fixture-access-token-8c1f";
const refreshToken = "fixture-refresh-token-5d2e";
const clientSecret = "fixture-client-secret-a97b";
const code = "fixture-authorization-code-3e40";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

interface Provider {
  user: Record<string, unknown> | undefined;
  tokenStatus: number;
  tokenBody: Record<string, unknown>;
  userStatus: number;
  tokenRequests: URLSearchParams[];
  userAuthorization: (string | undefined)[];
}

async function provider() {
  const state: Provider = {
    user: allowedUser,
    tokenStatus: 200,
    tokenBody: {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: 604800,
      scope: "identify",
    },
    userStatus: 200,
    tokenRequests: [],
    userAuthorization: [],
  };
  const server: Server = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/oauth2/token" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      state.tokenRequests.push(new URLSearchParams(body));
      response.statusCode = state.tokenStatus;
      response.end(JSON.stringify(state.tokenBody));
    } else if (request.url === "/api/v10/users/@me") {
      state.userAuthorization.push(request.headers.authorization);
      response.statusCode = state.userStatus;
      response.end(JSON.stringify(state.user));
    } else {
      response.statusCode = 404;
      response.end("{}");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanups.push(() => void server.close());
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return { state, port: address.port };
}

async function fixture(
  overrides: Partial<Config> = {},
  options: { dir?: string; allowed?: string[] } = {},
) {
  const fake = await provider();
  const dir = options.dir ?? mkdtempSync(join(tmpdir(), "embed-discord-"));
  const logs: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      logs.push(String(chunk));
      done();
    },
  });
  const app = await createApp(
    {
      authMode: "discord",
      botToken: "fixture-token",
      port: 8742,
      host: "127.0.0.1",
      dataDir: dir,
      discordApiBase: `http://127.0.0.1:${fake.port}/api`,
      publicUrl: "https://embed.example",
      discordLogin: {
        clientId: "999999999999999999",
        clientSecret,
        allowedUserIds: options.allowed ?? [
          allowedUser.id,
          "333333333333333333",
        ],
        authorizeUrl: "https://discord.example/oauth2/authorize",
      },
      ...overrides,
    },
    { logger: { level: "info", stream } },
  );
  app.post("/api/protected", async () => ({ ok: true }));
  cleanups.push(async () => {
    await app.close();
    if (!options.dir) rmSync(dir, { recursive: true });
  });
  return { app, dir, logs, fake: fake.state };
}

const cookiesOf = (response: { cookies: { name: string; value: string }[] }) =>
  response.cookies.map((c) => c.name + "=" + c.value).join("; ");

const sessionCookie = (response: {
  cookies: { name: string; value: string }[];
}) =>
  cookiesOf({
    cookies: response.cookies.filter((c) => c.name === "embed_session"),
  });

async function begin(app: FastifyInstance) {
  const response = await app.inject("/api/auth/discord");
  expect(response.statusCode).toBe(302);
  const location = new URL(response.headers.location as string);
  return {
    response,
    location,
    state: location.searchParams.get("state")!,
    cookie: cookiesOf(response),
  };
}
function callback(
  app: FastifyInstance,
  query: Record<string, string>,
  cookie?: string,
  headers: Record<string, string> = {},
) {
  return app.inject({
    url: "/api/auth/discord/callback?" + new URLSearchParams(query),
    headers: { ...(cookie ? { cookie } : {}), ...headers },
  });
}
async function signIn(app: FastifyInstance) {
  const { state, cookie } = await begin(app);
  const response = await callback(app, { code, state }, cookie);
  return { response, state, cookie };
}
async function sessionOf(app: FastifyInstance, cookie: string) {
  const response = await app.inject({
    url: "/api/session",
    headers: { cookie },
  });
  return { body: response.json(), cookie: cookiesOf(response) };
}

test("starts the authorization code flow with the identify scope only", async () => {
  const { app } = await fixture();
  const { location, response, state } = await begin(app);
  expect(location.origin + location.pathname).toBe(
    "https://discord.example/oauth2/authorize",
  );
  expect(Object.fromEntries(location.searchParams)).toEqual({
    response_type: "code",
    client_id: "999999999999999999",
    scope: "identify",
    state,
    redirect_uri: "https://embed.example/api/auth/discord/callback",
  });
  expect(state).toMatch(/^[a-f0-9]{64}$/);
  const header = String(response.headers["set-cookie"]);
  expect(header).toContain("embed_oauth_state=" + state);
  for (const flag of ["HttpOnly", "SameSite=Lax", "Max-Age=600"])
    expect(header).toContain(flag);
  expect(header).toContain("Path=/api/auth/discord");
  expect(response.headers["cache-control"]).toBe("no-store");
});

test("an approved account gets a session; the app shows its identity", async () => {
  const { app, fake } = await fixture();
  const { response } = await signIn(app);
  expect(response.statusCode).toBe(302);
  expect(response.headers.location).toBe("/");
  const cookie = sessionCookie(response);
  expect(cookie).toMatch(/^embed_session=[a-f0-9]{64}$/);
  expect(String(response.headers["set-cookie"])).toContain("HttpOnly");
  expect(fake.tokenRequests).toHaveLength(1);
  expect(Object.fromEntries(fake.tokenRequests[0])).toEqual({
    grant_type: "authorization_code",
    code,
    redirect_uri: "https://embed.example/api/auth/discord/callback",
    client_id: "999999999999999999",
    client_secret: clientSecret,
  });
  expect(fake.userAuthorization).toEqual(["Bearer " + accessToken]);
  const { body } = await sessionOf(app, cookie);
  expect(body).toMatchObject({
    authMode: "discord",
    authenticated: true,
    deniedUserId: null,
    user: {
      id: allowedUser.id,
      name: "Ada Lovelace",
      avatarUrl: `https://cdn.discordapp.com/avatars/${allowedUser.id}/${allowedUser.avatar}.png`,
    },
  });
  const headers = {
    cookie,
    host: "embed.example",
    origin: "https://embed.example",
    "x-csrf-token": body.csrfToken,
  };
  expect(
    (await app.inject({ method: "POST", url: "/api/protected", headers }))
      .statusCode,
  ).toBe(200);
  expect(
    (await app.inject({ url: "/api/bot", headers: { cookie } })).statusCode,
  ).not.toBe(401);
});

test("falls back to the username and no avatar", async () => {
  const { app, fake } = await fixture();
  fake.user = { ...allowedUser, global_name: null, avatar: null };
  const { response } = await signIn(app);
  const cookie = sessionCookie(response);
  expect((await sessionOf(app, cookie)).body.user).toMatchObject({
    name: "ada",
    avatarUrl: null,
  });
});

test("logout ends the Discord session", async () => {
  const { app } = await fixture();
  const { response } = await signIn(app);
  const cookie = sessionCookie(response);
  const { body } = await sessionOf(app, cookie);
  const logout = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: {
      cookie,
      host: "embed.example",
      origin: "https://embed.example",
      "x-csrf-token": body.csrfToken,
    },
  });
  expect(logout.statusCode).toBe(200);
  expect(
    (await app.inject({ url: "/api/bot", headers: { cookie } })).statusCode,
  ).toBe(401);
});

test("an account outside the allowlist gets no session and sees its ID", async () => {
  const { app, dir, fake } = await fixture();
  fake.user = blockedUser;
  const { response, state: oauthState } = await signIn(app);
  expect(response.statusCode).toBe(302);
  expect(response.headers.location).toBe("/login");
  expect(response.cookies.map((c) => c.name)).not.toContain("embed_session");
  const denied = cookiesOf({
    cookies: response.cookies.filter((c) => c.name === "embed_denied"),
  });
  expect(denied).toBe("embed_denied=" + blockedUser.id);
  const { body } = await sessionOf(app, denied);
  expect(body).toMatchObject({
    authenticated: false,
    user: null,
    deniedUserId: blockedUser.id,
  });
  expect(
    (await app.inject({ url: "/api/bot", headers: { cookie: denied } }))
      .statusCode,
  ).toBe(401);
  const retry = await app.inject({
    url: "/api/auth/discord",
    headers: { cookie: denied },
  });
  expect(String(retry.headers["set-cookie"])).toMatch(/embed_denied=;/);
  expect(oauthState).toBeTruthy();
  const db = openDatabase(dir);
  expect(db.prepare("SELECT count(*) AS count FROM sessions").get()).toEqual({
    count: 0,
  });
  db.close();
});

test.each([
  ["missing state", () => ({ code }), (cookie: string) => cookie],
  ["wrong state", () => ({ code, state: "f".repeat(64) }), (c: string) => c],
  [
    "state without the browser cookie",
    (state: string) => ({ code, state }),
    () => undefined,
  ],
  [
    "cookie from another sign-in",
    (state: string) => ({ code, state }),
    () => "embed_oauth_state=" + "e".repeat(64),
  ],
])("rejects %s without contacting Discord", async (_name, query, cookieFor) => {
  const { app, fake } = await fixture();
  const begun = await begin(app);
  const response = await callback(
    app,
    query(begun.state),
    cookieFor(begun.cookie),
  );
  expect(response.headers.location).toBe("/login?auth=expired");
  expect(response.cookies.map((c) => c.name)).not.toContain("embed_session");
  expect(fake.tokenRequests).toHaveLength(0);
});

test("a state works once", async () => {
  const { app, fake } = await fixture();
  const { state, cookie } = await begin(app);
  expect((await callback(app, { code, state }, cookie)).headers.location).toBe(
    "/",
  );
  const replay = await callback(app, { code, state }, cookie);
  expect(replay.headers.location).toBe("/login?auth=expired");
  expect(fake.tokenRequests).toHaveLength(1);
});

test("a state expires after ten minutes", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const { app, fake } = await fixture();
  const { state, cookie } = await begin(app);
  vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
  const response = await callback(app, { code, state }, cookie);
  expect(response.headers.location).toBe("/login?auth=expired");
  expect(fake.tokenRequests).toHaveLength(0);
});

test("pending states are bounded", async () => {
  const { app, fake } = await fixture();
  const first = await begin(app);
  for (let i = 0; i < 1000; i++) {
    // Spread over many client addresses so the start rate limit does not apply.
    await app.inject({
      url: "/api/auth/discord",
      remoteAddress: `10.0.${i >> 8}.${i & 255}`,
    });
  }
  const response = await callback(
    app,
    { code, state: first.state },
    first.cookie,
  );
  expect(response.headers.location).toBe("/login?auth=expired");
  expect(fake.tokenRequests).toHaveLength(0);
});

test("the callback accepts Discord's cross-site navigation without opening writes", async () => {
  const { app } = await fixture();
  const { state, cookie } = await begin(app);
  const response = await callback(app, { code, state }, cookie, {
    "sec-fetch-site": "cross-site",
    referer: "https://discord.com/",
  });
  expect(response.headers.location).toBe("/");
  const post = await app.inject({
    method: "POST",
    url: "/api/auth/discord/callback?" + new URLSearchParams({ code, state }),
    headers: { cookie, origin: "https://embed.example" },
  });
  expect(post.statusCode).toBe(401);
});

test("the user can decline on Discord", async () => {
  const { app, fake } = await fixture();
  const { state, cookie } = await begin(app);
  const response = await callback(
    app,
    { error: "access_denied", state },
    cookie,
  );
  expect(response.headers.location).toBe("/login?auth=cancelled");
  expect(fake.tokenRequests).toHaveLength(0);
});

test.each([
  ["missing code", (p: Provider) => p, {}],
  [
    "token endpoint rejects the code",
    (p: Provider) => (p.tokenStatus = 400),
    { code },
  ],
  [
    "a broader scope than requested was never granted",
    (p: Provider) => (p.tokenBody = { ...p.tokenBody, scope: "guilds" }),
    { code },
  ],
  [
    "no access token",
    (p: Provider) => (p.tokenBody = { scope: "identify" }),
    { code },
  ],
  ["user endpoint fails", (p: Provider) => (p.userStatus = 500), { code }],
  [
    "user has no valid ID",
    (p: Provider) => (p.user = { username: "ada", id: "not-a-snowflake" }),
    { code },
  ],
  ["unreadable user", (p: Provider) => (p.user = undefined), { code }],
])("a failed sign-in (%s) creates no session", async (_name, break_, query) => {
  const { app, fake, logs } = await fixture();
  break_(fake);
  const { state, cookie } = await begin(app);
  const response = await callback(app, { ...query, state }, cookie);
  expect(response.headers.location).toBe("/login?auth=failed");
  expect(response.cookies.map((c) => c.name)).not.toContain("embed_session");
  expect(logs.join("")).not.toContain(accessToken);
});

test("an unreachable Discord is reported without leaking details", async () => {
  const { app, logs } = await fixture({
    discordApiBase: "http://127.0.0.1:1/api",
  });
  const { state, cookie } = await begin(app);
  const response = await callback(app, { code, state }, cookie);
  expect(response.headers.location).toBe("/login?auth=failed");
  expect(logs.join("")).toContain("Discord sign-in failed");
  expect(logs.join("")).not.toContain(clientSecret);
});

test("Discord tokens, the secret and the code are never stored or logged", async () => {
  const { app, fake, dir, logs } = await fixture();
  const { response, state } = await signIn(app);
  const cookie = sessionCookie(response);
  const { body } = await sessionOf(app, cookie);
  fake.tokenStatus = 500;
  const failed = await begin(app);
  await callback(app, { code, state: failed.state }, failed.cookie);
  const secrets = [accessToken, refreshToken, clientSecret, code, state];
  const exposed = JSON.stringify(body) + String(response.headers["set-cookie"]);
  for (const secret of secrets) expect(exposed).not.toContain(secret);
  for (const secret of secrets.slice(0, 4))
    expect(logs.join("")).not.toContain(secret);
  // Includes the write-ahead log, where recent rows may still live.
  for (const file of readdirSync(dir)) {
    const contents = readFileSync(join(dir, file)).toString("latin1");
    for (const secret of secrets) expect(contents).not.toContain(secret);
  }
});

test("sessions stop working when the account leaves the allowlist", async () => {
  const dir = mkdtempSync(join(tmpdir(), "embed-discord-shared-"));
  cleanups.push(() => rmSync(dir, { recursive: true }));
  const first = await fixture({}, { dir });
  const { response } = await signIn(first.app);
  const cookie = sessionCookie(response);
  expect((await app_status(first.app, cookie)).statusCode).not.toBe(401);
  await first.app.close();
  const second = await fixture({}, { dir, allowed: ["333333333333333333"] });
  expect((await app_status(second.app, cookie)).statusCode).toBe(401);
  expect((await sessionOf(second.app, cookie)).body.authenticated).toBe(false);
});
const app_status = (app: FastifyInstance, cookie: string) =>
  app.inject({ url: "/api/bot", headers: { cookie } });

test("password login is disabled in Discord mode", async () => {
  const { app } = await fixture();
  const anonymous = await sessionOf(app, "");
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: {
      cookie: anonymous.cookie,
      host: "embed.example",
      origin: "https://embed.example",
      "x-csrf-token": anonymous.body.csrfToken,
    },
    payload: { password: "anything" },
  });
  expect(response.statusCode).toBe(400);
});

test("the Discord routes only exist in Discord mode", async () => {
  const dir = mkdtempSync(join(tmpdir(), "embed-discord-off-"));
  const app = await createApp(
    {
      authMode: "password",
      adminPassword: "fixture-password",
      botToken: "fixture-token",
      port: 8742,
      host: "127.0.0.1",
      dataDir: dir,
      discordApiBase: "http://127.0.0.1:1/api",
    },
    { logger: false },
  );
  cleanups.push(async () => {
    await app.close();
    rmSync(dir, { recursive: true });
  });
  expect((await app.inject("/api/auth/discord")).statusCode).toBe(401);
  expect((await app.inject("/api/auth/discord/callback")).statusCode).toBe(401);
});

test("incomplete Discord config is rejected", async () => {
  await expect(fixture({ discordLogin: undefined })).rejects.toThrow(
    "Discord login",
  );
  await expect(fixture({ publicUrl: undefined })).rejects.toThrow(
    "Discord login",
  );
});
