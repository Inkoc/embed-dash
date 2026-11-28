import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import type { Config } from "./config.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture(overrides: Partial<Config> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "embed-auth-"));
  const app = await createApp(
    {
      maxUploadMb: 10,
      uploadRetentionDays: 14,
      authMode: "password",
      adminPassword: "fixture-password",
      botToken: "fixture-token",
      port: 8742,
      host: "127.0.0.1",
      dataDir: dir,
      discordApiBase: "http://127.0.0.1:1/api",
      ...overrides,
    },
    { logger: false },
  );
  app.post("/api/protected", async () => ({ ok: true }));
  cleanups.push(async () => {
    await app.close();
    rmSync(dir, { recursive: true });
  });
  return { app, dir };
}
async function session(app: FastifyInstance, cookie?: string) {
  const response = await app.inject({
    url: "/api/session",
    headers: cookie ? { cookie } : {},
  });
  return {
    cookie:
      cookie ?? response.cookies.map((c) => c.name + "=" + c.value).join("; "),
    "x-csrf-token": response.json().csrfToken as string,
    origin: "http://localhost",
    host: "localhost",
  };
}
async function login(app: FastifyInstance) {
  const headers = await session(app);
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers,
    payload: { password: "fixture-password" },
  });
  expect(response.statusCode).toBe(200);
  const cookie = response.cookies.find((c) => c.name === "embed_session")!;
  return session(app, cookie.name + "=" + cookie.value);
}

test.each(["/api/bot", "/%61pi/bot", "/api/unknown", "/%61pi/unknown"])(
  "requires authentication for GET %s",
  async (url) => {
    const { app } = await fixture();
    expect((await app.inject(url)).statusCode).toBe(401);
  },
);
test.each(["/api/protected", "/%61pi/protected", "/%61pi/unknown"])(
  "protects POST %s",
  async (url) => {
    const { app } = await fixture();
    expect((await app.inject({ method: "POST", url })).statusCode).toBe(401);
    const headers = await login(app);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: { ...headers, "x-csrf-token": "" },
        })
      ).statusCode,
    ).toBe(403);
  },
);
test("cookieless session checks do not grow the database", async () => {
  const { app, dir } = await fixture();
  for (let i = 0; i < 100; i++)
    expect((await app.inject("/api/session")).statusCode).toBe(200);
  const db = openDatabase(dir);
  expect(db.prepare("SELECT count(*) AS count FROM sessions").get()).toEqual({
    count: 0,
  });
  db.close();
});
test("wrong password does not create a session", async () => {
  const { app } = await fixture();
  const headers = await session(app);
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers,
    payload: { password: "wrong" },
  });
  expect(response.statusCode).toBe(401);
  expect(
    (await app.inject({ url: "/api/session", headers })).json().authenticated,
  ).toBe(false);
});
test("login requires CSRF even before authentication", async () => {
  const { app } = await fixture();
  const headers = await session(app);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { ...headers, "x-csrf-token": "" },
        payload: { password: "fixture-password" },
      })
    ).statusCode,
  ).toBe(403);
});
test("login rotates CSRF, stores only a session hash and marks cookies private", async () => {
  const { app, dir } = await fixture();
  const anonymous = await session(app);
  const result = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: anonymous,
    payload: { password: "fixture-password" },
  });
  const cookie = result.cookies.find((c) => c.name === "embed_session")!;
  const authenticated = await session(app, cookie.name + "=" + cookie.value);
  expect(authenticated["x-csrf-token"]).not.toBe(anonymous["x-csrf-token"]);
  expect(result.headers["set-cookie"]).toEqual(
    expect.arrayContaining([expect.stringContaining("HttpOnly")]),
  );
  expect(result.headers["set-cookie"]).toEqual(
    expect.arrayContaining([expect.stringContaining("SameSite=Lax")]),
  );
  const db = openDatabase(dir);
  expect(db.prepare("SELECT id FROM sessions").get()).not.toEqual({
    id: cookie.value,
  });
  db.close();
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/%61pi/protected",
        headers: authenticated,
      })
    ).statusCode,
  ).toBe(200);
});
test("logout invalidates a session", async () => {
  const { app } = await fixture();
  const headers = await login(app);
  expect(
    (await app.inject({ method: "POST", url: "/api/auth/logout", headers }))
      .statusCode,
  ).toBe(200);
  expect((await app.inject({ url: "/api/bot", headers })).statusCode).toBe(401);
});
test("expired sessions cannot access the API", async () => {
  const { app, dir } = await fixture();
  const headers = await login(app);
  const db = openDatabase(dir);
  db.prepare("UPDATE sessions SET expires_at = 0").run();
  db.close();
  expect((await app.inject({ url: "/api/bot", headers })).statusCode).toBe(401);
});
test("login rate limit ignores spoofed forwarded clients by default", async () => {
  const { app } = await fixture();
  const headers = await session(app);
  for (let i = 0; i < 5; i++)
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { ...headers, "x-forwarded-for": "192.0.2." + (i + 1) },
          payload: { password: "wrong" },
        })
      ).statusCode,
    ).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers,
        payload: { password: "fixture-password" },
      })
    ).statusCode,
  ).toBe(429);
});
test("trusted proxy clients have separate login budgets", async () => {
  const { app } = await fixture({ trustProxy: ["127.0.0.1"] });
  const headers = await session(app);
  for (let i = 0; i < 5; i++)
    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { ...headers, "x-forwarded-for": "192.0.2.1" },
      payload: { password: "wrong" },
    });
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { ...headers, "x-forwarded-for": "192.0.2.1" },
        payload: { password: "wrong" },
      })
    ).statusCode,
  ).toBe(429);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { ...headers, "x-forwarded-for": "192.0.2.2" },
        payload: { password: "fixture-password" },
      })
    ).statusCode,
  ).toBe(200);
});
test.each([
  [undefined, false],
  [["127.0.0.1"], true],
  [["127.0.0.0/8"], true],
  [["10.0.0.0/8"], false],
])(
  "forwarded HTTPS with proxy trust %j is trusted: %s",
  async (trustProxy, trusted) => {
    const { app } = await fixture({ trustProxy });
    const response = await app.inject({
      url: "/api/session",
      headers: { "x-forwarded-proto": "https" },
    });
    expect(String(response.headers["set-cookie"]).includes("Secure")).toBe(
      trusted,
    );
    expect(response.headers["cache-control"]).toBe("no-store");
  },
);
test.each([
  { origin: "https://evil.example" },
  { referer: "https://evil.example/page" },
  { origin: "null" },
  { origin: "http://localhost", "sec-fetch-site": "cross-site" },
  {},
])("rejects missing or cross-origin login metadata %j", async (extra) => {
  const { app } = await fixture();
  const headers: Record<string, string> = await session(app);
  delete headers.origin;
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { ...headers, ...extra },
        payload: { password: "fixture-password" },
      })
    ).statusCode,
  ).toBe(403);
});
test.each([
  ["an HTTPS page on the same host", { origin: "https://localhost" }],
  [
    "forwarded headers from the proxy",
    { origin: "https://embed.example", "x-forwarded-proto": "https" },
  ],
])(
  "a refused sign-in behind an untrusted HTTPS proxy (%s) names the settings to configure",
  async (_, extra) => {
    const { app } = await fixture();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { ...(await session(app)), ...extra },
      payload: { password: "fixture-password" },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json<{ code: string; error: string }>();
    expect(body.code).toBe("PROXY_NOT_TRUSTED");
    expect(body.error).toContain("TRUST_PROXY");
    expect(body.error).toContain("PUBLIC_URL");
    // Nothing about the request or the instance is echoed back.
    expect(body.error).not.toMatch(/embed\.example|localhost|127\.0\.0\.1/);
  },
);
test.each<[string, Partial<Config>, Record<string, string>]>([
  ["a cross-site origin", {}, { origin: "https://evil.example" }],
  [
    "PUBLIC_URL already set",
    { publicUrl: "https://embed.example" },
    { origin: "https://other.example", "x-forwarded-proto": "https" },
  ],
  [
    "TRUST_PROXY already set",
    { trustProxy: ["10.0.0.0/8"] },
    { origin: "https://localhost", "x-forwarded-proto": "https" },
  ],
])(
  "other refused origins (%s) keep the plain refusal",
  async (_, config, extra) => {
    const { app } = await fixture(config);
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { ...(await session(app)), ...extra },
      payload: { password: "fixture-password" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "ORIGIN_REFUSED",
      error: "Request origin is not allowed",
    });
  },
);
test("accepts a same-origin Referer and configured public origin", async () => {
  const { app } = await fixture({ publicUrl: "https://embed.example" });
  const headers = await session(app);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers,
        payload: { password: "fixture-password" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { ...headers, origin: "https://embed.example" },
        payload: { password: "fixture-password" },
      })
    ).statusCode,
  ).toBe(200);
  const local = await fixture();
  const localHeaders: Record<string, string> = await session(local.app);
  delete localHeaders.origin;
  expect(
    (
      await local.app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { ...localHeaders, referer: "http://localhost/login" },
        payload: { password: "fixture-password" },
      })
    ).statusCode,
  ).toBe(200);
});
test.each([
  "evil.example",
  "localhost.evil.example",
  "127.0.0.1.evil.example",
  "user@localhost",
])("local mode blocks DNS rebinding Host %s", async (host) => {
  const { app } = await fixture({ authMode: "none" });
  expect(
    (await app.inject({ url: "/api/session", headers: { host } })).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/%61pi/protected",
        headers: { host },
      })
    ).statusCode,
  ).toBe(403);
});
test.each(["localhost", "127.0.0.1:8742", "[::1]:8742"])(
  "local mode accepts loopback Host %s and enforces CSRF and origin",
  async (host) => {
    const { app } = await fixture({ authMode: "none" });
    const state = await app.inject({ url: "/api/session", headers: { host } });
    expect(state.json()).toMatchObject({ authenticated: true, insecure: true });
    const headers = { ...(await session(app)), host, origin: "http://" + host };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/protected",
          headers: { ...headers, "x-csrf-token": "" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/protected",
          headers: { ...headers, origin: "http://evil.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: "POST", url: "/api/protected", headers }))
        .statusCode,
    ).toBe(200);
  },
);
test("a refused password and a paused sign-in answer differently", async () => {
  const { app } = await fixture();
  const headers = await session(app);
  const attempt = () =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers,
      payload: { password: "wrong" },
    });
  for (let i = 0; i < 5; i++)
    expect((await attempt()).json()).toMatchObject({ code: "WRONG_PASSWORD" });
  const paused = await attempt();
  expect(paused.statusCode).toBe(429);
  expect(paused.json()).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
  expect(paused.headers["retry-after"]).toBeDefined();
});
