import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { expect, test } from "vitest";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
test("health, real Discord REST identity, safe failures and SPA fallback", async () => {
  const token = "test-private-token";
  let failureStatus = 0;
  let avatar: string | null = "avatar-hash";
  const upstream = createServer((req, res) => {
    expect(req.url).toBe("/api/v10/users/@me");
    expect(req.headers.authorization).toBe(`Bot ${token}`);
    res.setHeader("content-type", "application/json");
    res.statusCode = failureStatus || 200;
    if (failureStatus === 429) res.setHeader("retry-after", "0.1");
    res.end(
      JSON.stringify(
        failureStatus
          ? { message: token, code: 0, retry_after: 0.1, global: false }
          : { id: "123", username: "Test bot", avatar },
      ),
    );
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  const dir = mkdtempSync(join(tmpdir(), "embed-app-"));
  writeFileSync(join(dir, "index.html"), "<h1>SPA</h1>");
  let logs = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      logs += String(chunk);
      callback();
    },
  });
  const app = await createApp(
    {
      maxUploadMb: 10,
      authMode: "none",
      botToken: token,
      host: "127.0.0.1",
      port: 8742,
      dataDir: dir,
      discordApiBase: `http://127.0.0.1:${address.port}/api`,
    },
    { spaRoot: dir, logger: { stream } },
  );
  try {
    expect((await app.inject("/health")).json()).toEqual({ status: "ok" });
    expect((await app.inject("/api/bot")).json()).toEqual({
      id: "123",
      name: "Test bot",
      avatarUrl: "https://cdn.discordapp.com/avatars/123/avatar-hash.png",
    });
    avatar = null;
    expect((await app.inject("/api/bot")).json().avatarUrl).toBeNull();
    for (const [status, code, responseStatus] of [
      [401, "DISCORD_INVALID_TOKEN", 502],
      [403, "DISCORD_REQUEST_FAILED", 502],
      [503, "DISCORD_UNAVAILABLE", 502],
      [429, "DISCORD_RATE_LIMITED", 503],
    ] as const) {
      failureStatus = status;
      const response = await app.inject("/api/bot");
      expect(response.statusCode).toBe(responseStatus);
      expect(response.json().code).toBe(code);
      expect(logs).toContain(code);
      expect(response.body).not.toContain(token);
      expect(logs).not.toContain(token);
    }
    const health = await app.inject("/health");
    expect(health.headers["x-content-type-options"]).toBe("nosniff");
    expect(health.headers["referrer-policy"]).toBe("no-referrer");
    expect(health.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect((await app.inject("/")).body).toContain("SPA");
    expect((await app.inject("/unknown")).body).toContain("SPA");
    expect((await app.inject("/api/missing")).statusCode).toBe(404);
    expect((await app.inject("/assets/missing.js")).statusCode).toBe(404);
  } finally {
    await app.close();
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(dir, { recursive: true });
  }
});
test("startup migrations are persistent and repeatable", () => {
  const dir = mkdtempSync(join(tmpdir(), "embed-db-"));
  try {
    let db = openDatabase(dir);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'sends'").get(),
    ).toEqual({ name: "sends" });
    expect(() =>
      db
        .prepare(
          "INSERT INTO sends VALUES ('id', '{}', '', 'invalid', NULL, 0, 0)",
        )
        .run(),
    ).toThrow(/CHECK/);
    db.close();
    db = openDatabase(dir);
    expect(db.prepare("SELECT count(*) AS count FROM sends").get()).toEqual({
      count: 0,
    });
    db.close();
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("client parsing errors keep their HTTP status", async () => {
  const dir = mkdtempSync(join(tmpdir(), "embed-client-errors-"));
  const app = await createApp(
    {
      maxUploadMb: 10,
      authMode: "none",
      botToken: "fixture-token",
      port: 8742,
      host: "127.0.0.1",
      dataDir: dir,
      discordApiBase: "http://127.0.0.1:1/api",
    },
    { logger: false },
  );
  app.post("/test", async (request) => request.body);
  try {
    const malformed = await app.inject({
      method: "POST",
      url: "/test",
      headers: { "content-type": "application/json" },
      payload: "{",
    });
    expect(malformed.statusCode).toBe(400);
    const unsupported = await app.inject({
      method: "POST",
      url: "/test",
      headers: { "content-type": "application/unsupported" },
      payload: "test",
    });
    expect(unsupported.statusCode).toBe(415);
    expect(unsupported.json()).toEqual({ error: "Request failed" });
    expect(unsupported.headers["x-frame-options"]).toBe("DENY");
  } finally {
    await app.close();
    rmSync(dir, { recursive: true });
  }
});

test("unreachable Discord is diagnosed without exposing the token", async () => {
  const upstream = createServer();
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  const dir = mkdtempSync(join(tmpdir(), "embed-offline-"));
  let logs = "";
  const stream = new Writable({
    write(chunk, _encoding, done) {
      logs += String(chunk);
      done();
    },
  });
  const app = await createApp(
    {
      maxUploadMb: 10,
      authMode: "none",
      botToken: "offline-private-token",
      port: 8742,
      host: "127.0.0.1",
      dataDir: dir,
      discordApiBase: `http://127.0.0.1:${address.port}/api`,
    },
    { logger: { stream } },
  );
  try {
    const response = await app.inject("/api/bot");
    expect(response.json().code).toBe("DISCORD_UNREACHABLE");
    expect(logs).toContain("ECONNREFUSED");
    expect(logs + response.body).not.toContain("offline-private-token");
  } finally {
    await app.close();
    rmSync(dir, { recursive: true });
  }
});

test("local mode warns when bound beyond loopback", async () => {
  const dir = mkdtempSync(join(tmpdir(), "embed-local-warning-"));
  let logs = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      logs += String(chunk);
      callback();
    },
  });
  const app = await createApp(
    {
      maxUploadMb: 10,
      authMode: "none",
      botToken: "fixture",
      port: 8742,
      host: "0.0.0.0",
      dataDir: dir,
      discordApiBase: "http://127.0.0.1:1/api",
    },
    { logger: { stream } },
  );
  try {
    expect(logs).toContain("No-login mode is bound beyond loopback");
  } finally {
    await app.close();
    rmSync(dir, { recursive: true });
  }
});
