import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";

test("password sessions enforce authentication, CSRF, rotation, expiry, logout and rate limits", async () => {
  const dir = mkdtempSync(join(tmpdir(), "embed-auth-"));
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
  app.post("/api/protected", async () => ({ ok: true }));
  try {
    expect((await app.inject("/api/bot")).statusCode).toBe(401);
    expect((await app.inject("/health")).statusCode).toBe(200);
    const session = await app.inject("/api/session");
    const cookie = session.cookies[0].name + "=" + session.cookies[0].value;
    const csrf = session.json().csrfToken as string;
    expect(session.json().authenticated).toBe(false);
    expect(session.headers["set-cookie"]).toContain("HttpOnly");
    expect(session.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(session.headers["cache-control"]).toBe("no-store");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { cookie },
          payload: { password: "fixture-password" },
        })
      ).statusCode,
    ).toBe(403);
    const login = (password: string) =>
      app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { cookie, "x-csrf-token": csrf },
        payload: { password },
      });
    expect((await login("wrong")).statusCode).toBe(401);
    const result = await login("fixture-password");
    expect(result.statusCode).toBe(200);
    const authenticatedCookie =
      result.cookies[0].name + "=" + result.cookies[0].value;
    expect(authenticatedCookie).not.toBe(cookie);
    expect(
      (await app.inject({ url: "/api/session", headers: { cookie } })).json()
        .authenticated,
    ).toBe(false);
    const authenticated = await app.inject({
      url: "/api/session",
      headers: { cookie: authenticatedCookie },
    });
    expect(authenticated.json().authenticated).toBe(true);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/protected",
          headers: { cookie: authenticatedCookie },
        })
      ).statusCode,
    ).toBe(403);
    const headers = {
      cookie: authenticatedCookie,
      "x-csrf-token": authenticated.json().csrfToken as string,
    };
    expect(
      (await app.inject({ method: "POST", url: "/api/protected", headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "POST", url: "/api/auth/logout", headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/protected", headers })).statusCode,
    ).toBe(401);
    const fresh = await app.inject("/api/session");
    const freshHeaders = {
      cookie: fresh.cookies[0].name + "=" + fresh.cookies[0].value,
      "x-csrf-token": fresh.json().csrfToken as string,
    };
    const relogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: freshHeaders,
      payload: { password: "fixture-password" },
    });
    const db = openDatabase(dir);
    db.prepare("UPDATE sessions SET expires_at = 0").run();
    db.close();
    expect(
      (
        await app.inject({
          url: "/api/bot",
          headers: {
            cookie: relogin.cookies[0].name + "=" + relogin.cookies[0].value,
          },
        })
      ).statusCode,
    ).toBe(401);
    const attempt = await app.inject("/api/session");
    const attemptHeaders = {
      cookie: attempt.cookies[0].name + "=" + attempt.cookies[0].value,
      "x-csrf-token": attempt.json().csrfToken as string,
    };
    for (let i = 0; i < 5; i++)
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: attemptHeaders,
        payload: { password: "wrong" },
      });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: attemptHeaders,
          payload: { password: "wrong" },
        })
      ).statusCode,
    ).toBe(429);
    const https = await app.inject({
      url: "/api/session",
      headers: { "x-forwarded-proto": "https" },
    });
    expect(https.headers["set-cookie"]).toContain("Secure");
  } finally {
    await app.close();
    rmSync(dir, { recursive: true });
  }
});

test("local mode is explicit and requires CSRF on writes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "embed-local-"));
  const app = await createApp(
    {
      authMode: "none",
      botToken: "fixture",
      port: 8742,
      host: "127.0.0.1",
      dataDir: dir,
      discordApiBase: "http://127.0.0.1:1/api",
    },
    { logger: false },
  );
  app.post("/api/protected", async () => ({ ok: true }));
  try {
    const session = await app.inject("/api/session");
    expect(session.json()).toMatchObject({
      authenticated: true,
      insecure: true,
      authMode: "none",
    });
    expect(
      (await app.inject({ method: "POST", url: "/api/protected" })).statusCode,
    ).toBe(403);
    const headers = {
      cookie: session.cookies[0].name + "=" + session.cookies[0].value,
      "x-csrf-token": session.json().csrfToken as string,
    };
    expect(
      (await app.inject({ method: "POST", url: "/api/protected", headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers,
          payload: { password: "x" },
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true });
  }
});
