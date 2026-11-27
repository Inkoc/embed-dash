import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { emptyEmbed, type MessageDraft } from "@embed-dash/shared";
import { createApp } from "./app.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "embed-templates-"));
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
  return { app, dir, headers: await login(app) };
}

async function login(app: FastifyInstance) {
  const first = await app.inject("/api/session");
  const headers = {
    cookie: first.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
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

async function upload(
  app: FastifyInstance,
  headers: Record<string, string>,
  filename: string,
) {
  const boundary = "----fixtureboundary";
  const response = await app.inject({
    method: "POST",
    url: "/api/uploads",
    headers: {
      ...headers,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  return response.json() as {
    id: string;
    filename: string;
    size: number;
    contentType: string;
  };
}

const message = (
  title: string,
  attachments: MessageDraft["attachments"] = [],
): MessageDraft => ({
  content: "This week in the server",
  embeds: [{ ...emptyEmbed(), title }],
  attachments,
});

test("saves, lists, reads, renames, overwrites and deletes a template", async () => {
  const { app, headers } = await fixture();
  const created = await app.inject({
    method: "POST",
    url: "/api/templates",
    headers,
    payload: { name: "  Weekly digest ", message: message("Digest") },
  });
  expect(created.statusCode).toBe(201);
  const template = created.json();
  expect(template).toMatchObject({
    name: "Weekly digest",
    message: message("Digest"),
    missingFiles: [],
  });
  expect(Date.parse(template.updatedAt)).not.toBeNaN();

  await app.inject({
    method: "POST",
    url: "/api/templates",
    headers,
    payload: { name: "Rules", message: message("Rules") },
  });
  const list = await app.inject({ url: "/api/templates", headers });
  // Most recently updated first.
  expect(list.json().map((t: { name: string }) => t.name)).toEqual([
    "Rules",
    "Weekly digest",
  ]);

  const renamed = await app.inject({
    method: "PATCH",
    url: `/api/templates/${template.id}`,
    headers,
    payload: { name: "Weekly news" },
  });
  expect(renamed.json()).toMatchObject({
    name: "Weekly news",
    message: message("Digest"),
  });

  const overwritten = await app.inject({
    method: "PATCH",
    url: `/api/templates/${template.id}`,
    headers,
    payload: { message: message("Digest, week 2") },
  });
  expect(overwritten.json()).toMatchObject({
    name: "Weekly news",
    message: message("Digest, week 2"),
  });
  const read = await app.inject({
    url: `/api/templates/${template.id}`,
    headers,
  });
  expect(read.json().message.embeds[0].title).toBe("Digest, week 2");
  expect(
    (await app.inject({ url: "/api/templates", headers })).json()[0].name,
  ).toBe("Weekly news");

  const removed = await app.inject({
    method: "DELETE",
    url: `/api/templates/${template.id}`,
    headers,
  });
  expect(removed.statusCode).toBe(204);
  expect(
    (await app.inject({ url: `/api/templates/${template.id}`, headers }))
      .statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/templates/${template.id}`,
        headers,
        payload: { name: "Gone" },
      })
    ).statusCode,
  ).toBe(404);
});

test("refuses a missing or overlong name and a malformed message", async () => {
  const { app, headers } = await fixture();
  const post = (payload: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/api/templates", headers, payload });
  for (const name of ["", "   ", "x".repeat(101)]) {
    const response = await post({ name, message: message("A") });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe(
      "Give the template a name of 1 to 100 characters.",
    );
  }
  const broken = await post({ name: "A", message: { content: 1 } });
  expect(broken.statusCode).toBe(400);
  expect(broken.json().error).toContain("couldn’t be read");
  const created = (await post({ name: "A", message: message("A") })).json();
  const empty = await app.inject({
    method: "PATCH",
    url: `/api/templates/${created.id}`,
    headers,
    payload: {},
  });
  expect(empty.statusCode).toBe(400);
  expect(
    (await app.inject({ url: "/api/templates/not-a-uuid", headers }))
      .statusCode,
  ).toBe(400);
});

test("keeps only stored files, keeps them through a draft clear, and flags files lost later", async () => {
  const { app, dir, headers } = await fixture();
  const kept = await upload(app, headers, "banner.png");
  const lost = await upload(app, headers, "map.png");
  const ghost = { ...kept, id: "00000000-0000-4000-8000-000000000000" };
  const created = await app.inject({
    method: "POST",
    url: "/api/templates",
    headers,
    payload: {
      name: "Event",
      message: message("Event", [
        // The browser's claim about a stored file is replaced by the server's record.
        { ...kept, filename: "renamed.png", size: 1 },
        lost,
        ghost,
      ]),
    },
  });
  const template = created.json();
  expect(template.message.attachments).toEqual([kept, lost]);
  expect(template.missingFiles).toEqual([]);

  // Clearing the draft lets go of the files, but the template still holds them.
  for (const file of [kept, lost])
    await app.inject({
      method: "DELETE",
      url: `/api/uploads/${file.id}`,
      headers,
    });
  expect(
    (await app.inject({ url: `/api/uploads/${kept.id}`, headers })).statusCode,
  ).toBe(200);

  rmSync(join(dir, "uploads", lost.id));
  const read = await app.inject({
    url: `/api/templates/${template.id}`,
    headers,
  });
  expect(read.json().message.attachments).toEqual([kept, lost]);
  expect(read.json().missingFiles).toEqual([lost.id]);
  expect(
    (await app.inject({ url: "/api/templates", headers })).json()[0]
      .missingFiles,
  ).toEqual([lost.id]);
});

test("every template route needs a session, and changes need the CSRF token", async () => {
  const { app, headers } = await fixture();
  const id = "00000000-0000-4000-8000-000000000000";
  const routes = [
    { method: "GET", url: "/api/templates" },
    { method: "GET", url: `/api/templates/${id}` },
    { method: "POST", url: "/api/templates" },
    { method: "PATCH", url: `/api/templates/${id}` },
    { method: "DELETE", url: `/api/templates/${id}` },
  ] as const;
  for (const route of routes) {
    const response = await app.inject({
      ...route,
      headers: { origin: "http://localhost", host: "localhost" },
      payload: route.method === "GET" ? undefined : {},
    });
    expect(response.statusCode).toBe(401);
  }
  const withoutToken = await app.inject({
    method: "POST",
    url: "/api/templates",
    headers: { ...headers, "x-csrf-token": "" },
    payload: { name: "A", message: message("A") },
  });
  expect(withoutToken.statusCode).toBe(403);
});
