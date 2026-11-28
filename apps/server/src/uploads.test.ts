import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import { sniffContentType, sweepUploads } from "./uploads.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "embed-uploads-"));
  const app = await createApp(
    {
      authMode: "password",
      adminPassword: "fixture-password",
      botToken: "fixture-token",
      port: 8742,
      host: "127.0.0.1",
      dataDir: dir,
      maxUploadMb: 1,
      uploadRetentionDays: 14,
      discordApiBase: "http://127.0.0.1:1/api",
    },
    { logger: false },
  );
  cleanups.push(async () => {
    await app.close();
    rmSync(dir, { recursive: true });
  });
  return { app, dir };
}

async function login(app: FastifyInstance) {
  const first = await app.inject("/api/session");
  const pre = first.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const headers = {
    cookie: pre,
    "x-csrf-token": first.json().csrfToken as string,
    origin: "http://localhost",
    host: "localhost",
  };
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers,
    payload: { password: "fixture-password" },
  });
  const cookie = response.cookies.find((c) => c.name === "embed_session")!;
  const cookieHeader = `${cookie.name}=${cookie.value}`;
  const next = await app.inject({
    url: "/api/session",
    headers: { cookie: cookieHeader },
  });
  return {
    ...headers,
    cookie: cookieHeader,
    "x-csrf-token": next.json().csrfToken as string,
  };
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

function multipartBody(filename: string, content: Buffer) {
  const boundary = "----fixtureboundary";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    payload: body,
    "content-type": `multipart/form-data; boundary=${boundary}`,
  };
}

const upload = (
  app: FastifyInstance,
  headers: Record<string, string>,
  filename: string,
  content: Buffer,
) => {
  const { payload, ...type } = multipartBody(filename, content);
  return app.inject({
    method: "POST",
    url: "/api/uploads",
    headers: { ...headers, ...type },
    payload,
  });
};

test("stores an upload under a generated name with a sanitised filename", async () => {
  const { app, dir } = await fixture();
  const headers = await login(app);
  const response = await upload(app, headers, "My Banner (1).png", png);
  expect(response.statusCode).toBe(201);
  const body = response.json();
  expect(body).toMatchObject({
    filename: "My_Banner_1_.png",
    size: png.length,
    contentType: "image/png",
  });
  expect(readdirSync(join(dir, "uploads"))).toEqual([body.id]);
  expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  const db = openDatabase(dir);
  expect(db.prepare("SELECT filename, size FROM uploads").all()).toEqual([
    { filename: "My_Banner_1_.png", size: png.length },
  ]);
  db.close();
});

test("rejects a file over the limit before it is kept", async () => {
  const { app, dir } = await fixture();
  const headers = await login(app);
  // Declared length alone is enough to refuse.
  const declared = await upload(
    app,
    headers,
    "big.bin",
    Buffer.alloc(1024 * 1024 + 70_000),
  );
  expect(declared.statusCode).toBe(413);
  expect(declared.json().error).toContain("1 MB");
  // Just over the limit passes the declared check and is cut off while streaming.
  const streamed = await upload(
    app,
    headers,
    "big.bin",
    Buffer.alloc(1024 * 1024 + 10),
  );
  expect(streamed.statusCode).toBe(413);
  expect(streamed.json().error).toBe("Files can be at most 1 MB.");
  expect(
    existsSync(join(dir, "uploads")) ? readdirSync(join(dir, "uploads")) : [],
  ).toEqual([]);
  const db = openDatabase(dir);
  expect(db.prepare("SELECT count(*) AS n FROM uploads").get()).toEqual({
    n: 0,
  });
  db.close();
  expect(
    (await upload(app, headers, "ok.bin", Buffer.alloc(1024 * 1024)))
      .statusCode,
  ).toBe(201);
});

test("says why a malformed upload is refused", async () => {
  const { app } = await fixture();
  const headers = await login(app);
  const boundary = "----fixtureboundary";
  const field = await app.inject({
    method: "POST",
    url: "/api/uploads",
    headers: {
      ...headers,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: `--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nhello\r\n--${boundary}--\r\n`,
  });
  expect(field.statusCode).toBe(413);
  expect(field.json().error).toBe("Send one file per upload.");
  const json = await app.inject({
    method: "POST",
    url: "/api/uploads",
    headers,
    payload: { file: "a.png" },
  });
  expect(json.statusCode).toBe(415);
  expect(json.json().error).toBe("Uploads must be sent as a file form.");
});

test("rejects empty files", async () => {
  const { app } = await fixture();
  const headers = await login(app);
  expect(
    (await upload(app, headers, "a.txt", Buffer.alloc(0))).statusCode,
  ).toBe(400);
});

test("requires a session, the CSRF token and a same-origin request", async () => {
  const { app, dir } = await fixture();
  const headers = await login(app);
  const without = (change: Record<string, string>) =>
    upload(app, { ...headers, ...change }, "a.png", png);
  expect((await without({ cookie: "" })).statusCode).toBe(401);
  expect((await without({ "x-csrf-token": "" })).statusCode).toBe(403);
  expect((await without({ origin: "http://evil.example" })).statusCode).toBe(
    403,
  );
  expect(existsSync(join(dir, "uploads"))).toBe(false);
});

test("serves only images, from sniffed bytes, and reports missing files", async () => {
  const { app, dir } = await fixture();
  const headers = await login(app);
  const image = (await upload(app, headers, "a.png", png)).json();
  const html = (
    await upload(
      app,
      headers,
      "page.png",
      Buffer.from("<script>alert(1)</script>"),
    )
  ).json();
  expect(html.contentType).toBe("application/octet-stream");

  const served = await app.inject({
    url: `/api/uploads/${image.id}/content`,
    headers: { cookie: headers.cookie },
  });
  expect(served.statusCode).toBe(200);
  expect(served.headers["content-type"]).toBe("image/png");
  expect(served.headers["x-content-type-options"]).toBe("nosniff");
  expect(served.rawPayload.equals(png)).toBe(true);
  expect(
    (
      await app.inject({
        url: `/api/uploads/${html.id}/content`,
        headers: { cookie: headers.cookie },
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (await app.inject({ url: `/api/uploads/${image.id}/content` })).statusCode,
  ).toBe(401);

  const meta = await app.inject({
    url: `/api/uploads/${html.id}`,
    headers: { cookie: headers.cookie },
  });
  expect(meta.json()).toMatchObject({ id: html.id, filename: "page.png" });

  rmSync(join(dir, "uploads", image.id));
  expect(
    (
      await app.inject({
        url: `/api/uploads/${image.id}`,
        headers: { cookie: headers.cookie },
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        url: "/api/uploads/not-an-id",
        headers: { cookie: headers.cookie },
      })
    ).statusCode,
  ).toBe(400);
});

test("deleting removes the row and the file", async () => {
  const { app, dir } = await fixture();
  const headers = await login(app);
  const { id } = (await upload(app, headers, "a.png", png)).json();
  const response = await app.inject({
    method: "DELETE",
    url: `/api/uploads/${id}`,
    headers,
  });
  expect(response.statusCode).toBe(204);
  expect(readdirSync(join(dir, "uploads"))).toEqual([]);
});

test("the sweep removes files past retention that no send or template refers to, and keeps the rest", () => {
  const dir = mkdtempSync(join(tmpdir(), "embed-sweep-"));
  const db = openDatabase(dir);
  try {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const old = now - 14 * day - 1;
    const uploads = join(dir, "uploads");
    mkdirSync(uploads);
    const add = (id: string, createdAt: number) => {
      writeFileSync(join(uploads, id), png);
      db.prepare(
        "INSERT INTO uploads (id, filename, content_type, size, created_at) VALUES (?, 'a.png', 'image/png', 1, ?)",
      ).run(id, createdAt);
    };
    add("old-unused", old);
    add("old-sent", old);
    add("old-template", old);
    // A draft left for nearly two weeks still has its file.
    add("recent", now - 13 * day);
    db.prepare(
      "INSERT INTO sends (id, payload_json, search_text, status, created_at, updated_at) VALUES ('s', ?, '', 'done', 1, 1)",
    ).run(JSON.stringify({ attachments: [{ id: "old-sent" }] }));
    db.prepare(
      "INSERT INTO templates (id, name, payload_json, updated_at) VALUES ('t', 'Weekly', ?, 1)",
    ).run(JSON.stringify({ attachments: [{ id: "old-template" }] }));
    // Left by an interrupted upload: a file with no record.
    writeFileSync(join(uploads, "stray-old"), png);
    utimesSync(join(uploads, "stray-old"), old / 1000, old / 1000);
    writeFileSync(join(uploads, "stray-new"), png);

    sweepUploads(dir, db, 14, now);

    expect(readdirSync(uploads).sort()).toEqual([
      "old-sent",
      "old-template",
      "recent",
      "stray-new",
    ]);
    expect(db.prepare("SELECT id FROM uploads ORDER BY id").all()).toEqual([
      { id: "old-sent" },
      { id: "old-template" },
      { id: "recent" },
    ]);
  } finally {
    db.close();
    rmSync(dir, { recursive: true });
  }
});

test("an inaccessible entry does not stop cleanup of later files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "embed-sweep-fail-"));
  // A directory where a stray file would be: removing it as a file throws.
  const stray = join(dir, "uploads", "stray-dir");
  mkdirSync(stray, { recursive: true });
  const long = Date.now() / 1000 - 60 * 24 * 60 * 60;
  utimesSync(stray, long, long);
  const removable = join(dir, "uploads", "z-removable");
  writeFileSync(removable, "old file");
  utimesSync(removable, long, long);
  const app = await createApp(
    {
      authMode: "none",
      botToken: "fixture-token",
      port: 8742,
      host: "127.0.0.1",
      dataDir: dir,
      maxUploadMb: 1,
      uploadRetentionDays: 14,
      discordApiBase: "http://127.0.0.1:1/api",
    },
    { logger: false },
  );
  try {
    expect(existsSync(stray)).toBe(true);
    expect(existsSync(removable)).toBe(false);
    expect((await app.inject("/health")).statusCode).toBe(200);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true });
  }
});

test("recognises image types by their first bytes", () => {
  const pad = (bytes: number[]) =>
    Buffer.from([...bytes, ...Array(16).fill(0)]);
  expect(sniffContentType(pad([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
  expect(sniffContentType(Buffer.from("GIF89a" + "\0".repeat(10)))).toBe(
    "image/gif",
  );
  expect(sniffContentType(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe(
    "image/webp",
  );
  expect(
    sniffContentType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
  ).toBe("application/octet-stream");
});
