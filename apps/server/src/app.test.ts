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
  let fail = false;
  let avatar: string | null = "avatar-hash";
  const upstream = createServer((req, res) => {
    expect(req.url).toBe("/api/v10/users/@me");
    expect(req.headers.authorization).toBe(`Bot ${token}`);
    res.setHeader("content-type", "application/json");
    res.statusCode = fail ? 401 : 200;
    res.end(
      JSON.stringify(
        fail
          ? { message: token, code: 0 }
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
      botToken: token,
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
    fail = true;
    const response = await app.inject("/api/bot");
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain(token);
    expect(logs).not.toContain(token);
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
