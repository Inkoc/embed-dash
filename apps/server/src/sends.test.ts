import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, truncateSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, test } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { emptyEmbed, type MessagePayload } from "@embed-dash/shared";
import { fakeGuilds, startFakeDiscord } from "../../../e2e/fake-discord.js";
import { createApp } from "./app.js";
import { createDiscord } from "./discord.js";
import { registerSends } from "./sends.js";
import type { Config } from "./config.js";
import { openDatabase } from "./db.js";
import { sweepUploads } from "./uploads.js";
import { deliveryFailure } from "./errors.js";
import { discordMessage } from "./payload.js";

type Fake = ReturnType<typeof startFakeDiscord>;
interface Setup {
  config: Config;
  app: FastifyInstance;
  fake: Fake;
  dir: string;
  headers: Record<string, string>;
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const channel = (guild: number, name: string) =>
  fakeGuilds[guild - 1].channels.find((c) => c.name === name)!.id;
const news = channel(3, "news");
const results = channel(3, "results");
const schedule = channel(3, "match-schedule");
const general = channel(1, "general");

async function setup(
  options: { token?: string; maxUploadMb?: number } = {},
): Promise<Setup> {
  const fake = startFakeDiscord(0);
  await once(fake, "listening");
  const address = fake.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const dir = mkdtempSync(join(tmpdir(), "embed-sends-"));
  const config: Config = {
    authMode: "password",
    adminPassword: "sends-test-password",
    botToken: options.token ?? "e2e-test-token",
    port: 8742,
    host: "127.0.0.1",
    dataDir: dir,
    maxUploadMb: options.maxUploadMb ?? 10,
    uploadRetentionDays: 14,
    discordApiBase: `http://127.0.0.1:${address.port}/api`,
  };
  const app = await createApp(config, { logger: false });
  cleanups.push(async () => {
    await app.close();
    fake.close();
    rmSync(dir, { recursive: true });
  });
  const first = await app.inject("/api/session");
  const pre = first.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const base = { origin: "http://localhost", host: "localhost" };
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: {
      ...base,
      cookie: pre,
      "x-csrf-token": first.json().csrfToken as string,
    },
    payload: { password: "sends-test-password" },
  });
  const session = login.cookies.find((c) => c.name === "embed_session")!;
  const cookie = `${session.name}=${session.value}`;
  const next = await app.inject({ url: "/api/session", headers: { cookie } });
  return {
    config,
    app,
    fake,
    dir,
    headers: {
      ...base,
      cookie,
      "x-csrf-token": next.json().csrfToken as string,
    },
  };
}

const payload = (change: Partial<MessagePayload> = {}): MessagePayload => ({
  content: "Patch 0.9.4 is out.",
  embeds: [],
  attachments: [],
  pings: [],
  silent: false,
  ...change,
});

const post = (
  { app, headers }: Setup,
  channelIds: string[],
  change: Partial<MessagePayload> = {},
  id: string = randomUUID(),
) =>
  app.inject({
    method: "POST",
    url: "/api/sends",
    headers,
    payload: { id, payload: payload(change), channelIds },
  });
const retry = ({ app, headers }: Setup, id: string, body: object = {}) =>
  app.inject({
    method: "POST",
    url: `/api/sends/${id}/retry`,
    headers,
    payload: body,
  });
const read = ({ app, headers }: Setup, id: string) =>
  app.inject({ url: `/api/sends/${id}`, headers });

/** Polls until the send has no copy left in flight, as the browser does. */
async function settle(s: Setup, id: string) {
  for (let i = 0; i < 500; i++) {
    const send = (await read(s, id)).json();
    if (send.status !== "sending" && send.edit?.status !== "sending")
      return send;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("The send never finished");
}
/** Sends and waits for every channel to be tried. */
async function sent(
  s: Setup,
  channelIds: string[],
  change: Partial<MessagePayload> = {},
) {
  const id = randomUUID();
  const response = await post(s, channelIds, change, id);
  expect(response.statusCode).toBe(202);
  expect(response.json()).toEqual({ id });
  return settle(s, id);
}
async function retried(s: Setup, id: string, body: object = {}) {
  const response = await retry(s, id, body);
  expect(response.statusCode).toBe(202);
  return settle(s, id);
}

const database = (dir: string) => new Database(join(dir, "embed-dash.db"));
const rows = (dir: string, sql: string) => {
  const db = database(dir);
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
};

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
async function upload(
  { app, headers }: Setup,
  filename: string,
  content: Buffer = png,
) {
  const boundary = "----sendsboundary";
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
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  expect(response.statusCode).toBe(201);
  return response.json() as {
    id: string;
    filename: string;
    size: number;
    contentType: string;
  };
}

test("sends to every channel in order and records one target per channel", async () => {
  const s = await setup();
  const send = await sent(s, [news, schedule]);
  expect(send.status).toBe("done");
  expect(send.targets).toEqual([
    expect.objectContaining({
      guildName: "Lanternfall Cup EU",
      channelId: news,
      channelName: "news",
      status: "sent",
      error: null,
    }),
    expect.objectContaining({ channelId: schedule, status: "sent" }),
  ]);
  expect(s.fake.messages.map((m) => m.channelId)).toEqual([news, schedule]);
  expect(send.targets.map((t: { messageId: string }) => t.messageId)).toEqual(
    s.fake.messages.map((m) => m.id),
  );
  expect(s.fake.messages[0]).toMatchObject({
    multipart: false,
    payload: {
      content: "Patch 0.9.4 is out.",
      allowed_mentions: { parse: [] },
    },
  });
  expect(s.fake.messages[0].payload).not.toHaveProperty("flags");

  expect(
    rows(s.dir, "SELECT status, payload_json, search_text FROM sends"),
  ).toEqual([
    {
      status: "done",
      payload_json: expect.stringContaining("Patch 0.9.4 is out."),
      search_text: "Patch 0.9.4 is out.",
    },
  ]);
  expect(
    rows(
      s.dir,
      "SELECT channel_name, status, message_id FROM send_targets ORDER BY position",
    ),
  ).toEqual([
    {
      channel_name: "news",
      status: "sent",
      message_id: send.targets[0].messageId,
    },
    {
      channel_name: "match-schedule",
      status: "sent",
      message_id: send.targets[1].messageId,
    },
  ]);
});

test("pings only when the send opts in, and silent sets the notification flag", async () => {
  const s = await setup();
  await sent(s, [news], {
    pings: ["users", "roles", "everyone"],
    silent: true,
  });
  expect(s.fake.messages[0].payload).toMatchObject({
    allowed_mentions: { parse: ["users", "roles", "everyone"] },
    flags: 4096,
  });
  await sent(s, [news], { pings: ["roles"] });
  expect(s.fake.messages[1].payload).toMatchObject({
    allowed_mentions: { parse: ["roles"] },
  });
});

test("turns the composed embeds into Discord's shape", () => {
  const sentAt = new Date("2026-11-27T10:00:00.000Z");
  const body = discordMessage(
    payload({
      content: "  ",
      embeds: [
        {
          ...emptyEmbed(),
          color: "#e8a33d",
          title: "Patch 0.9.4",
          url: " https://lanternfall.example/patch ",
          author: { name: "Dev team", url: "", iconUrl: "attachment://a.png" },
          fields: [{ name: "Goes live", value: "Thursday", inline: true }],
          image: "attachment://banner.png",
          footer: { text: "Patch notes", iconUrl: "" },
          timestamp: "now",
        },
        {
          ...emptyEmbed(),
          description: "Plain",
          timestamp: "2026-11-28T09:30:00Z",
        },
      ],
      attachments: [
        { id: "u1", filename: "a.png", size: 3, contentType: "image/png" },
        { id: "u2", filename: "banner.png", size: 3, contentType: "image/png" },
      ],
    }),
    sentAt,
  );
  expect(JSON.parse(JSON.stringify(body))).toEqual({
    embeds: [
      {
        title: "Patch 0.9.4",
        url: "https://lanternfall.example/patch",
        color: 0xe8a33d,
        timestamp: "2026-11-27T10:00:00.000Z",
        author: { name: "Dev team", icon_url: "attachment://a.png" },
        fields: [{ name: "Goes live", value: "Thursday", inline: true }],
        image: { url: "attachment://banner.png" },
        footer: { text: "Patch notes" },
      },
      {
        description: "Plain",
        color: 0x0d9488,
        timestamp: "2026-11-28T09:30:00.000Z",
      },
    ],
    attachments: [
      { id: 0, filename: "a.png" },
      { id: 1, filename: "banner.png" },
    ],
    allowed_mentions: { parse: [] },
  });
});

test("a partial failure keeps the other copies, and retry re-sends only the failed one", async () => {
  const s = await setup();
  s.fake.fail(results, { status: 403, code: 50013 });
  const send = await sent(s, [news, results, schedule]);
  expect(send.status).toBe("partial");
  expect(send.targets.map((t: { status: string }) => t.status)).toEqual([
    "sent",
    "failed",
    "sent",
  ]);
  expect(send.targets[1].error).toMatchObject({
    code: "MISSING_PERMISSION",
    message: expect.stringContaining("isn’t allowed to post"),
  });
  expect(s.fake.messages).toHaveLength(2);

  const done = await retried(s, send.id);
  expect(done.status).toBe("done");
  expect(done.targets.map((t: { status: string }) => t.status)).toEqual([
    "sent",
    "sent",
    "sent",
  ]);
  // Only the failed channel was posted to again; the others keep their message IDs.
  expect(s.fake.messages.map((m) => m.channelId)).toEqual([
    news,
    schedule,
    results,
  ]);
  expect(done.targets[0].messageId).toBe(send.targets[0].messageId);
  expect(done.targets[1].error).toBeNull();
  expect(done.id).toBe(send.id);

  const nothing = await retry(s, send.id);
  expect(nothing.statusCode).toBe(409);
  expect(nothing.json().code).toBe("NOTHING_TO_RETRY");
});

test("clearing the draft after a partial send keeps the file its retry needs", async () => {
  const s = await setup();
  const banner = await upload(s, "banner.png");
  s.fake.fail(results, { status: 403, code: 50013 });
  const send = await sent(s, [news, results], { attachments: [banner] });
  expect(send.status).toBe("partial");

  // What Clear draft does with each of the draft's files.
  const cleared = await s.app.inject({
    method: "DELETE",
    url: `/api/uploads/${banner.id}`,
    headers: s.headers,
  });
  expect(cleared.statusCode).toBe(204);

  const done = await retried(s, send.id);
  expect(done.status).toBe("done");
  expect(s.fake.messages.at(-1)?.channelId).toBe(results);
});

test("retry can be limited to chosen failed copies", async () => {
  const s = await setup();
  s.fake.fail(news, { status: 403, code: 50013 });
  s.fake.fail(results, { status: 403, code: 50013 });
  const send = await sent(s, [news, results]);
  expect(send.status).toBe("failed");
  const only = await retried(s, send.id, { targetIds: [send.targets[1].id] });
  expect(only.targets.map((t: { status: string }) => t.status)).toEqual([
    "failed",
    "sent",
  ]);
  expect(only.status).toBe("partial");
  expect(s.fake.messages.map((m) => m.channelId)).toEqual([results]);
  expect((await retry(s, "not-a-uuid")).statusCode).toBe(400);
  expect(
    (await retry(s, "6f1c1e1e-6d5e-4b8e-8f7a-0b6d2f4f9a11")).statusCode,
  ).toBe(404);
  expect((await retry(s, send.id, { targetIds: [] })).statusCode).toBe(400);
});

test.each([
  [404, 10003, "CHANNEL_GONE"],
  [403, 50001, "MISSING_PERMISSION"],
  [400, 50035, "INVALID_PAYLOAD"],
  [413, 40005, "INVALID_PAYLOAD"],
  [502, 0, "DISCORD_UNAVAILABLE"],
])("a %i answer (code %i) reads as %s", async (status, code, expected) => {
  const s = await setup();
  s.fake.fail(news, { status, code });
  const send = await sent(s, [news]);
  expect(send.targets[0]).toMatchObject({
    status: "failed",
    error: { code: expected },
  });
  expect(send.status).toBe("failed");
});

test("a dropped connection leaves the copy unknown and is not retried unseen", async () => {
  const s = await setup();
  s.fake.fail(news, { status: 0 });
  const send = await sent(s, [news, schedule]);
  expect(send.status).toBe("partial");
  expect(send.targets[0]).toMatchObject({
    status: "unknown",
    messageId: null,
    error: { code: "UNKNOWN_OUTCOME" },
  });
  expect(send.targets[0].error.message).toContain("may have been posted");
  expect((await retry(s, send.id)).statusCode).toBe(409);
});

test("waits out a short rate limit and then delivers", async () => {
  const s = await setup();
  s.fake.fail(news, { status: 429, retryAfter: 0.3 });
  const started = Date.now();
  const send = await sent(s, [news, schedule]);
  expect(Date.now() - started).toBeGreaterThanOrEqual(250);
  expect(send.status).toBe("done");
  expect(s.fake.messages.map((m) => m.channelId)).toEqual([news, schedule]);
});

test("a rate limit that would hold the send for too long fails only that channel", async () => {
  const s = await setup();
  s.fake.fail(news, { status: 429, retryAfter: 600 });
  const started = Date.now();
  const send = await sent(s, [news, schedule]);
  expect(Date.now() - started).toBeLessThan(5000);
  expect(send.targets[0]).toMatchObject({
    status: "failed",
    error: { code: "RATE_LIMITED" },
  });
  expect(send.targets[1].status).toBe("sent");
  expect(send.status).toBe("partial");
});

test("a refused bot token stops the send and says so", async () => {
  const s = await setup();
  s.fake.fail(news, { status: 401 });
  const send = await sent(s, [news, results, schedule]);
  expect(send.status).toBe("failed");
  expect(send.targets[0].error).toMatchObject({
    code: "INVALID_TOKEN",
    message: expect.stringContaining("bot token"),
  });
  expect(send.targets[1].error.code).toBe("NOT_ATTEMPTED");
  expect(send.targets[2].error.code).toBe("NOT_ATTEMPTED");
  // Nothing after the refused post was attempted.
  expect(s.fake.messages).toEqual([]);
  expect(JSON.stringify(send)).not.toContain("e2e-test-token");
  // Once the cause is fixed, the stopped copies are retried like any failure.
  expect((await retried(s, send.id)).status).toBe("done");
});

test("a token rejected while listing channels is reported before anything is stored", async () => {
  const s = await setup({ token: "wrong-token" });
  const response = await post(s, [news]);
  expect(response.statusCode).toBe(502);
  expect(response.json()).toMatchObject({
    code: "DISCORD_INVALID_TOKEN",
    error: expect.stringContaining("bot token"),
  });
  expect(response.body).not.toContain("wrong-token");
  expect(rows(s.dir, "SELECT id FROM sends")).toEqual([]);
});

test("uploads go as files[n] beside payload_json, with the stored names", async () => {
  const s = await setup();
  const banner = await upload(s, "Banner Image.png");
  const notes = await upload(s, "notes.txt", Buffer.from("release notes\n"));
  expect(banner.filename).toBe("Banner_Image.png");
  const response = await sent(s, [news, schedule], {
    attachments: [banner, notes],
    embeds: [
      {
        ...emptyEmbed(),
        title: "Patch",
        image: `attachment://${banner.filename}`,
      },
    ],
  });
  expect(response.status).toBe("done");
  for (const message of s.fake.messages) {
    expect(message.multipart).toBe(true);
    expect(message.files).toEqual([
      { field: "files[0]", filename: "Banner_Image.png", size: banner.size },
      { field: "files[1]", filename: "notes.txt", size: 14 },
    ]);
    expect(message.payload.attachments).toEqual([
      { id: 0, filename: "Banner_Image.png" },
      { id: 1, filename: "notes.txt" },
    ]);
    expect(message.payload.embeds).toEqual([
      expect.objectContaining({
        image: { url: "attachment://Banner_Image.png" },
      }),
    ]);
  }
  // A retry sends the files again from the server's copy.
  s.fake.fail(news, { status: 403, code: 50013 });
  const second = await sent(s, [news], {
    attachments: [banner],
    content: "again",
  });
  expect((await retried(s, second.id)).status).toBe("done");
  expect(s.fake.messages.at(-1)!.files).toHaveLength(1);
});

test("a file the server no longer has blocks the send and names it, with its image fields", async () => {
  const s = await setup();
  const banner = await upload(s, "banner.png");
  const kept = await upload(s, "kept.png");
  unlinkSync(join(s.dir, "uploads", banner.id));
  const gone = {
    id: "6f1c1e1e-6d5e-4b8e-8f7a-0b6d2f4f9a11",
    filename: "ghost.png",
    size: 5,
    contentType: "image/png",
  };
  const response = await post(s, [news], {
    attachments: [banner, kept, gone],
    embeds: [
      {
        ...emptyEmbed(),
        title: "Patch",
        image: "attachment://banner.png",
        thumbnail: "attachment://ghost.png",
        footer: { text: "x", iconUrl: "attachment://kept.png" },
      },
    ],
  });
  expect(response.statusCode).toBe(422);
  const body = response.json();
  expect(body.code).toBe("UPLOAD_MISSING");
  expect(body.missingFiles).toEqual([banner.id, gone.id]);
  expect(body.issues).toEqual([
    expect.objectContaining({
      path: "attachments.0",
      message:
        "banner.png is no longer on the server. Remove it and upload the file again.",
    }),
    expect.objectContaining({
      path: "attachments.2",
      message: expect.stringContaining("ghost.png is no longer on the server"),
    }),
    expect.objectContaining({ path: "embeds.0.image" }),
    expect.objectContaining({ path: "embeds.0.thumbnail" }),
  ]);
  expect(s.fake.messages).toEqual([]);
  expect(rows(s.dir, "SELECT id FROM sends")).toEqual([]);

  // A file deleted after the send blocks its retry the same way.
  const ok = await upload(s, "later.png");
  s.fake.fail(news, { status: 403, code: 50013 });
  const send = await sent(s, [news], { attachments: [ok] });
  unlinkSync(join(s.dir, "uploads", ok.id));
  const blocked = await retry(s, send.id);
  expect(blocked.statusCode).toBe(422);
  expect(blocked.json().code).toBe("UPLOAD_MISSING");
});

test("checks count, total size, names and references against the stored records", async () => {
  const s = await setup({ maxUploadMb: 20 });
  const small = await Promise.all(
    Array.from({ length: 11 }, (_, i) => upload(s, `file-${i}.png`)),
  );
  const many = await post(s, [news], { attachments: small });
  expect(many.statusCode).toBe(422);
  expect(many.json().issues).toEqual([
    expect.objectContaining({
      message: expect.stringContaining("at most 10 files"),
    }),
  ]);

  // Two files of 13 MB are each fine, together they pass 25 MB.
  const big = [await upload(s, "a.png"), await upload(s, "b.png")];
  for (const file of big)
    truncateSync(join(s.dir, "uploads", file.id), 13 * 1024 * 1024);
  const db = database(s.dir);
  db.prepare("UPDATE uploads SET size = ? WHERE id IN (?, ?)").run(
    13 * 1024 * 1024,
    big[0].id,
    big[1].id,
  );
  db.close();
  const heavy = await post(s, [news], {
    attachments: big.map((file) => ({ ...file, size: 1 })),
  });
  expect(heavy.statusCode).toBe(422);
  expect(heavy.json().issues[0].message).toContain("26 MB");

  // The server's name decides what attachment:// means, not the browser's claim.
  const one = await upload(s, "real.png");
  const claimed = await post(s, [news], {
    attachments: [{ ...one, filename: "claimed.png" }],
    embeds: [
      { ...emptyEmbed(), title: "T", image: "attachment://claimed.png" },
    ],
  });
  expect(claimed.statusCode).toBe(422);
  expect(claimed.json().issues).toEqual([
    expect.objectContaining({
      path: "embeds.0.image",
      message: expect.stringContaining("No attached file is named claimed.png"),
    }),
  ]);
  expect(s.fake.messages).toEqual([]);
});

test("two uploads whose names collide after shortening are told apart", async () => {
  const s = await setup();
  const long = "x".repeat(120);
  const first = await upload(s, `${long}a.png`);
  const second = await upload(s, `${long}b.png`, Buffer.concat([png, png]));
  expect(second.filename).toBe(first.filename);
  expect(first.filename).toHaveLength(100);
  const response = await post(s, [news], { attachments: [first, second] });
  expect(response.statusCode).toBe(422);
  expect(response.json().issues).toEqual([
    expect.objectContaining({
      path: "attachments.1",
      message: expect.stringMatching(
        /Another file is also named x+\.png\. Remove this/,
      ),
    }),
  ]);
});

test("refuses channels that are gone, closed to the bot or forums, sending nothing", async () => {
  const s = await setup();
  const response = await post(s, [
    news,
    "999",
    channel(1, "moderators"),
    channel(1, "bug-reports"),
  ]);
  expect(response.statusCode).toBe(409);
  expect(response.json()).toMatchObject({
    code: "CHANNELS_UNAVAILABLE",
    channels: [
      { id: "999", reason: "gone" },
      { id: channel(1, "moderators"), reason: "permission" },
      { id: channel(1, "bug-reports"), reason: "forum" },
    ],
  });
  expect(s.fake.messages).toEqual([]);
  expect(rows(s.dir, "SELECT id FROM sends")).toEqual([]);
});

test("a channel that vanished since the send is re-checked on retry, not posted to", async () => {
  const s = await setup();
  s.fake.fail(general, { status: 403, code: 50013 });
  const send = await sent(s, [general, news]);
  expect(send.status).toBe("partial");
  s.fake.remove(general);
  await s.app.inject({
    url: "/api/guilds?refresh=1",
    headers: { cookie: s.headers.cookie },
  });
  const again = await retried(s, send.id);
  expect(again.targets[0]).toMatchObject({
    status: "failed",
    error: { code: "CHANNEL_GONE" },
  });
  expect(s.fake.messages.map((m) => m.channelId)).toEqual([news]);
});

test("rejects a message Discord would refuse and a malformed request", async () => {
  const s = await setup();
  const empty = await post(s, [news], { content: "" });
  expect(empty.statusCode).toBe(422);
  expect(empty.json()).toMatchObject({
    code: "INVALID_MESSAGE",
    issues: [{ path: "content", message: "Add message text or an embed." }],
  });
  const long = await post(s, [news], { content: "x".repeat(2001) });
  expect(long.json().issues[0].message).toContain("1 character over");

  for (const body of [
    { id: randomUUID(), payload: payload() },
    { id: randomUUID(), payload: payload(), channelIds: [] },
    { id: randomUUID(), payload: payload(), channelIds: [news, news] },
    {
      id: randomUUID(),
      payload: { ...payload(), pings: ["bots"] },
      channelIds: [news],
    },
    { id: "not-a-uuid", payload: payload(), channelIds: [news] },
    { id: randomUUID(), channelIds: [news] },
  ]) {
    const response = await s.app.inject({
      method: "POST",
      url: "/api/sends",
      headers: s.headers,
      payload: body,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_REQUEST");
  }
  expect(s.fake.messages).toEqual([]);
});

test("sends sit behind sign-in and the CSRF check", async () => {
  const s = await setup();
  const body = { id: randomUUID(), payload: payload(), channelIds: [news] };
  const anonymous = await s.app.inject({
    method: "POST",
    url: "/api/sends",
    headers: { origin: "http://localhost", host: "localhost" },
    payload: body,
  });
  expect(anonymous.statusCode).toBe(401);
  const noToken = await s.app.inject({
    method: "POST",
    url: "/api/sends",
    headers: { ...s.headers, "x-csrf-token": "" },
    payload: body,
  });
  expect(noToken.statusCode).toBe(403);
  const retryAnonymous = await s.app.inject({
    method: "POST",
    url: "/api/sends/6f1c1e1e-6d5e-4b8e-8f7a-0b6d2f4f9a11/retry",
    headers: { origin: "http://localhost", host: "localhost" },
    payload: {},
  });
  expect(retryAnonymous.statusCode).toBe(401);
  expect(s.fake.messages).toEqual([]);
});

test("classifies failures without an answer from Discord", () => {
  const refused = Object.assign(new Error("fetch failed"), {
    cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }),
  });
  expect(deliveryFailure(refused)).toEqual({
    code: "UNREACHABLE",
    outcome: "failed",
    stop: false,
  });
  expect(deliveryFailure(new DOMException("aborted", "AbortError"))).toEqual({
    code: "UNKNOWN_OUTCOME",
    outcome: "unknown",
    stop: false,
  });
  expect(deliveryFailure({ status: 418 }).code).toBe("INVALID_PAYLOAD");
  expect(deliveryFailure({ status: 401 })).toMatchObject({ stop: true });
});

test("answers at once with the send's id and delivers in the background, in the operator's order", async () => {
  const s = await setup();
  s.fake.slow(150);
  const id = randomUUID();
  const started = Date.now();
  const response = await post(s, [news, results, schedule], {}, id);
  expect(response.statusCode).toBe(202);
  expect(response.json()).toEqual({ id });
  expect(Date.now() - started).toBeLessThan(140);

  // While it runs, the targets are on record as pending and fill in one by one.
  const early = (await read(s, id)).json();
  expect(early.status).toBe("sending");
  expect(early.targets.map((t: { channelId: string }) => t.channelId)).toEqual([
    news,
    results,
    schedule,
  ]);
  expect(early.targets[2].status).toBe("pending");
  await expect
    .poll(async () => {
      const now = (await read(s, id)).json();
      return now.targets.map((t: { status: string }) => t.status).join();
    })
    .toBe("sent,sent,sent");
  expect((await read(s, id)).json().status).toBe("done");
  // A retry can't start on a send that is still being delivered.
  const second = randomUUID();
  await post(s, [news, schedule], {}, second);
  expect((await retry(s, second)).statusCode).toBe(409);
  expect((await retry(s, second)).json().code).toBe("SEND_IN_PROGRESS");
  await settle(s, second);
});

test("repeating a request with the same id returns that send and posts nothing more", async () => {
  const s = await setup();
  s.fake.slow(100);
  const id = randomUUID();
  await post(s, [news, schedule], {}, id);
  // The first answer was lost: the browser asks again, even with the send still running.
  const again = await post(s, [news, schedule], {}, id);
  expect(again.statusCode).toBe(202);
  expect(again.json()).toEqual({ id });
  await settle(s, id);
  expect((await post(s, [news], {}, id)).json()).toEqual({ id });
  expect(s.fake.messages).toHaveLength(2);
  expect(rows(s.dir, "SELECT id FROM sends")).toHaveLength(1);
  expect(rows(s.dir, "SELECT id FROM send_targets")).toHaveLength(2);
  expect((await read(s, randomUUID())).statusCode).toBe(404);
  expect((await read(s, "not-a-uuid")).statusCode).toBe(400);
});

const statuses = (dir: string, sendId: string) =>
  (
    rows(
      dir,
      `SELECT status, error FROM send_targets WHERE send_id = '${sendId}' ORDER BY position`,
    ) as { status: string; error: string | null }[]
  ).map((t) => (t.error ? `${t.status}:${t.error}` : t.status));

test("a restart leaves only the copy being posted unknown and lets retry take the ones never tried", async () => {
  const s = await setup();
  const done = await sent(s, [news]);
  const cutOff = randomUUID();
  const db = openDatabase(s.dir);
  db.prepare(
    "INSERT INTO sends (id, payload_json, search_text, status, created_at, updated_at) VALUES (?, ?, '', 'sending', 1, 1)",
  ).run(cutOff, JSON.stringify(payload()));
  const insert = db.prepare(
    "INSERT INTO send_targets (id, send_id, guild_id, guild_name, channel_id, channel_name, status, position) VALUES (?, ?, ?, 'G', ?, 'c', ?, ?)",
  );
  const guild = fakeGuilds[2].id;
  insert.run("t1", cutOff, guild, news, "sent", 0);
  insert.run("t2", cutOff, guild, results, "posting", 1);
  insert.run("t3", cutOff, guild, schedule, "pending", 2);
  insert.run("t4", cutOff, guild, schedule, "pending", 3);
  db.close();
  await s.app.close();
  const restarted = await createApp(
    { ...s.config, dataDir: s.dir },
    { logger: false },
  );
  cleanups.push(() => restarted.close());
  expect(statuses(s.dir, cutOff)).toEqual([
    "sent",
    "unknown:UNKNOWN_OUTCOME",
    "failed:NOT_ATTEMPTED",
    "failed:NOT_ATTEMPTED",
  ]);
  expect(
    rows(s.dir, `SELECT status FROM sends WHERE id = '${cutOff}'`),
  ).toEqual([{ status: "partial" }]);
  expect(
    rows(s.dir, `SELECT status FROM sends WHERE id = '${done.id}'`),
  ).toEqual([{ status: "done" }]);

  // Retry sends to the channels never tried and leaves the unconfirmed one alone.
  const again = { ...s, app: restarted };
  expect((await retried(again, cutOff)).status).toBe("partial");
  expect(statuses(s.dir, cutOff)).toEqual([
    "sent",
    "unknown:UNKNOWN_OUTCOME",
    "sent",
    "sent",
  ]);
  expect(s.fake.messages.map((m) => m.channelId)).toEqual([
    news,
    schedule,
    schedule,
  ]);
});

test("a copy is marked as being posted until Discord answers, and the ones after it stay pending", async () => {
  const s = await setup();
  s.fake.slow(300);
  const id = randomUUID();
  await post(s, [news, results, schedule], {}, id);
  await expect
    .poll(() => statuses(s.dir, id).join())
    .toBe("posting,pending,pending");
  const early = (await read(s, id)).json();
  expect(early.targets[0].status).toBe("posting");
  await settle(s, id);
  expect(statuses(s.dir, id)).toEqual(["sent", "sent", "sent"]);
});

test("stopping the server finishes the post in flight, starts no more and records the rest as not sent", async () => {
  const s = await setup();
  s.fake.slow(300);
  const id = randomUUID();
  await post(s, [news, results, schedule], {}, id);
  await expect.poll(() => statuses(s.dir, id)[0]).toBe("posting");
  const started = Date.now();
  await s.app.close();
  // It waited for one post, not for all three.
  expect(Date.now() - started).toBeLessThan(800);
  expect(statuses(s.dir, id)).toEqual([
    "sent",
    "failed:NOT_ATTEMPTED",
    "failed:NOT_ATTEMPTED",
  ]);
  expect(rows(s.dir, `SELECT status FROM sends WHERE id = '${id}'`)).toEqual([
    { status: "partial" },
  ]);
  expect(s.fake.messages).toHaveLength(1);
});

test("two requests with the same id that overlap while the listing loads store one send and post once", async () => {
  const s = await setup();
  s.fake.slowListing(200);
  const id = randomUUID();
  const [first, second] = await Promise.all([
    post(s, [news, schedule], {}, id),
    post(s, [news, schedule], {}, id),
  ]);
  expect([first.statusCode, second.statusCode]).toEqual([202, 202]);
  expect(first.json()).toEqual({ id });
  expect(second.json()).toEqual({ id });
  await settle(s, id);
  expect(s.fake.messages.map((m) => m.channelId)).toEqual([news, schedule]);
  expect(rows(s.dir, "SELECT id FROM sends")).toHaveLength(1);
  expect(rows(s.dir, "SELECT id FROM send_targets")).toHaveLength(2);
});

test("a connection dropped before the send is stored can be recovered by asking again with the same id", async () => {
  const s = await setup();
  s.fake.slowListing(400);
  await s.app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = s.app.server.address() as { port: number };
  const origin = `http://127.0.0.1:${port}`;
  const id = randomUUID();
  const body = JSON.stringify({
    id,
    payload: payload(),
    channelIds: [news, schedule],
  });
  const headers = {
    ...s.headers,
    origin,
    host: `127.0.0.1:${port}`,
    "content-type": "application/json",
  };
  const dropped = new AbortController();
  const first = fetch(`${origin}/api/sends`, {
    method: "POST",
    headers,
    body,
    signal: dropped.signal,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  dropped.abort();
  await expect(first).rejects.toThrow();
  // The server hasn't stored it yet, so there is nothing to find...
  expect((await read(s, id)).statusCode).toBe(404);
  // ...but asking again is safe: whichever request stores it, there is one send.
  const again = await post(s, [news, schedule], {}, id);
  expect(again.statusCode).toBe(202);
  const send = await settle(s, id);
  expect(send.status).toBe("done");
  // Both requests carried on, and each channel got one message.
  expect(s.fake.messages.map((m) => m.channelId)).toEqual([news, schedule]);
  expect(rows(s.dir, "SELECT id FROM sends")).toHaveLength(1);
});

test("two retries that start together can't both deliver, even for different copies", async () => {
  const s = await setup();
  s.fake.fail(news, { status: 503 });
  s.fake.fail(schedule, { status: 503 });
  const send = await sent(s, [news, schedule]);
  s.fake.slow(150);
  const [first, second] = await Promise.all(
    send.targets.map((t: { id: string }) =>
      retry(s, send.id, { targetIds: [t.id] }),
    ),
  );
  expect([first.statusCode, second.statusCode].sort()).toEqual([202, 409]);
  expect([first, second].find((r) => r.statusCode === 409)!.json().code).toBe(
    "SEND_IN_PROGRESS",
  );
  await settle(s, send.id);
  expect(s.fake.messages).toHaveLength(1);
});

test("two sends to one channel each get their own rate-limit allowance", async () => {
  const s = await setup();
  // Each post is held up four times and then given up on; with turns taken, the
  // second send can't reset the first one's count and spend its allowance.
  s.fake.fail(news, { status: 429, retryAfter: 0.01, times: 8 });
  const [a, b] = [randomUUID(), randomUUID()];
  await Promise.all([post(s, [news], {}, a), post(s, [news], {}, b)]);
  const [first, second] = await Promise.all([settle(s, a), settle(s, b)]);
  expect(first.targets[0].error.code).toBe("RATE_LIMITED");
  expect(second.targets[0].error.code).toBe("RATE_LIMITED");
  // All eight forced answers were used up by exactly those two posts.
  expect((await sent(s, [news])).status).toBe("done");
  expect(s.fake.messages).toHaveLength(1);
});

test.each([500, 504])(
  "a %i from Discord leaves the copy unknown, since it may have been stored",
  async (status) => {
    const s = await setup();
    s.fake.fail(news, { status });
    const send = await sent(s, [news]);
    expect(send.targets[0]).toMatchObject({
      status: "unknown",
      error: { code: "UNKNOWN_OUTCOME" },
    });
    expect((await retry(s, send.id)).statusCode).toBe(409);
  },
);

test("a 503 from Discord is a failure that can be retried", async () => {
  const s = await setup();
  s.fake.fail(news, { status: 503 });
  const send = await sent(s, [news]);
  expect(send.targets[0]).toMatchObject({
    status: "failed",
    error: { code: "DISCORD_UNAVAILABLE" },
  });
  expect((await retried(s, send.id)).status).toBe("done");
});

test("gives up on a channel that is rate limited again and again", async () => {
  const s = await setup();
  s.fake.fail(news, { status: 429, retryAfter: 0.01, times: 10 });
  const started = Date.now();
  const send = await sent(s, [news, schedule]);
  expect(Date.now() - started).toBeLessThan(3000);
  expect(send.targets[0]).toMatchObject({
    status: "failed",
    error: { code: "RATE_LIMITED" },
  });
  expect(send.targets[1].status).toBe("sent");
  // The next post to that channel starts with a clean count.
  const again = await retried(s, send.id);
  expect(again.targets[0].status).toBe("failed");
  s.fake.fail(news, { status: 429, retryAfter: 0.01, times: 2 });
  expect((await retried(s, send.id)).status).toBe("done");
});

test("repeated refusals from one server skip its remaining channels, not other servers'", async () => {
  const s = await setup();
  const community = ["announcements", "patch-notes", "general", "events"].map(
    (name) => channel(1, name),
  );
  for (const id of community.slice(0, 3))
    s.fake.fail(id, { status: 403, code: 50013 });
  const modding = channel(2, "release-notes");
  const send = await sent(s, [...community.slice(0, 3), modding, community[3]]);
  const codes = send.targets.map(
    (t: { error: { code: string } | null }) => t.error?.code ?? "sent",
  );
  expect(codes).toEqual([
    "MISSING_PERMISSION",
    "MISSING_PERMISSION",
    "MISSING_PERMISSION",
    "sent",
    "SERVER_REFUSING",
  ]);
  expect(send.targets[4].error.message).toContain("several channels");
  expect(s.fake.messages.map((m) => m.channelId)).toEqual([modding]);
});

test("history searches stored text and destinations, filters and paginates behind auth", async () => {
  const context = await setup();
  const { app, headers, dir } = context;
  const first = (
    await post(context, [news], {
      content: "First literal 100%",
      embeds: [{ ...emptyEmbed(), title: "Zircon launch" }],
    })
  ).json().id as string;
  await settle(context, first);
  const second = (
    await post(context, [general], { content: "Second bulletin" })
  ).json().id as string;
  await settle(context, second);
  const database = new Database(join(dir, "embed-dash.db"));
  database
    .prepare("UPDATE sends SET created_at = ? WHERE id = ?")
    .run(Date.parse("2026-11-20T12:00:00Z"), first);
  database
    .prepare("UPDATE sends SET created_at = ?, status = 'partial' WHERE id = ?")
    .run(Date.parse("2026-11-21T12:00:00Z"), second);
  const target = database
    .prepare("SELECT * FROM send_targets WHERE send_id = ?")
    .get(first) as {
    guild_id: string;
    guild_name: string;
    channel_name: string;
  };
  database.close();
  const list = async (query = "") => {
    const response = await app.inject({ url: `/api/sends${query}`, headers });
    expect(response.statusCode).toBe(200);
    return response.json();
  };
  expect(
    (await list()).entries.map((entry: { id: string }) => entry.id),
  ).toEqual([second, first]);
  for (const q of ["zircon", "100%", target.guild_name, target.channel_name]) {
    expect(
      (await list(`?q=${encodeURIComponent(q)}`)).entries.map(
        (entry: { id: string }) => entry.id,
      ),
    ).toContain(first);
  }
  expect((await list("?q=100_")).entries).toEqual([]);
  for (const filter of [
    `guildId=${target.guild_id}`,
    `channelId=${news}`,
    "status=done",
    "from=2026-11-20&to=2026-11-20",
  ]) {
    expect(
      (await list(`?${filter}`)).entries.map(
        (entry: { id: string }) => entry.id,
      ),
    ).toEqual([first]);
  }
  expect((await list("?status=failed")).entries).toEqual([]);
  expect(
    (await list("?from=2026-11-21")).entries.map(
      (entry: { id: string }) => entry.id,
    ),
  ).toEqual([second]);
  expect((await list("?limit=1")).hasMore).toBe(true);
  expect((await list("?limit=1&page=2")).entries[0].id).toBe(first);
  expect((await list("?limit=1&page=2")).hasMore).toBe(false);
  expect((await list("?page=20")).entries).toEqual([]);
  for (const query of [
    "page=0",
    "limit=101",
    "status=draft",
    "from=bad",
    "from=2026-11-22&to=2026-11-20",
    "q=a&q=b",
  ]) {
    expect(
      (await app.inject({ url: `/api/sends?${query}`, headers })).statusCode,
    ).toBe(400);
  }
  expect((await app.inject("/api/sends")).statusCode).toBe(401);
  expect((await app.inject(`/api/sends/${first}`)).statusCode).toBe(401);
  const detail = await app.inject({ url: `/api/sends/${first}`, headers });
  expect(detail.json().payload.content).toBe("First literal 100%");
  expect(detail.json().createdAt).toBe(Date.parse("2026-11-20T12:00:00Z"));
});

test("history folds Unicode text and destination names and accepts channel prefixes", async () => {
  const context = await setup();
  const first = (
    await post(context, [news], {
      content: "ŽIVOT ΚΑΛΗМΕРА Привет",
      embeds: [{ ...emptyEmbed(), title: "ÉTÉ release" }],
    })
  ).json().id as string;
  await settle(context, first);
  const second = (
    await post(context, [general], { content: "Another bulletin" })
  ).json().id as string;
  await settle(context, second);
  const database = new Database(join(context.dir, "embed-dash.db"));
  database
    .prepare(
      "UPDATE send_targets SET guild_name = ?, channel_name = ? WHERE send_id = ?",
    )
    .run("Čakovec Αθήνα Москва", "ŠTĚSTÍ_100%!", first);
  database.close();
  for (const term of [
    "život",
    "Été",
    "čAKOVEC",
    "αθήνα",
    "москва",
    "ПРИВЕТ",
    "#štěstí_100%!",
    "##ŠTĚSTÍ",
    "100%!",
  ]) {
    const response = await context.app.inject({
      url: `/api/sends?q=${encodeURIComponent(term)}`,
      headers: context.headers,
    });
    expect(response.statusCode).toBe(200);
    expect(
      response.json().entries.map((entry: { id: string }) => entry.id),
    ).toEqual([first]);
  }
  for (const term of ["štěstíX100%!", "100_!"]) {
    const response = await context.app.inject({
      url: `/api/sends?q=${encodeURIComponent(term)}`,
      headers: context.headers,
    });
    expect(response.json().entries).toEqual([]);
  }
});

const edit = (
  s: Setup,
  id: string,
  change: Partial<MessagePayload> = {},
  editId = randomUUID(),
) =>
  s.app.inject({
    method: "PUT",
    url: `/api/sends/${id}`,
    headers: s.headers,
    payload: { id: editId, payload: payload(change) },
  });

test("edits every existing copy with original mentions and an idempotent run", async () => {
  const s = await setup();
  const initial = await sent(s, [news, results], {
    pings: ["roles"],
    silent: true,
  });
  const editId = randomUUID();
  expect(
    (
      await edit(
        s,
        initial.id,
        { content: "Revised", pings: ["everyone"] },
        editId,
      )
    ).statusCode,
  ).toBe(202);
  const done = await settle(s, initial.id);
  expect(done.targets.map((t: { status: string }) => t.status)).toEqual([
    "sent",
    "sent",
  ]);
  expect(done.lastEditedAt).toBeGreaterThanOrEqual(initial.createdAt);
  expect(s.fake.messages).toHaveLength(2);
  for (const message of s.fake.messages) {
    expect(message.payload.content).toBe("Revised");
    expect(message.payload.allowed_mentions).toEqual({ parse: ["roles"] });
  }
  expect(
    (await edit(s, initial.id, { content: "Duplicate" }, editId)).statusCode,
  ).toBe(202);
  expect(s.fake.messages[0].payload.content).toBe("Revised");
});

test("failed edit copies retry while deleted copies stay deleted", async () => {
  const s = await setup();
  const initial = await sent(s, [news, results, schedule]);
  s.fake.fail(results, { status: 403, code: 50013 });
  s.fake.messages.splice(
    s.fake.messages.findIndex((m) => m.channelId === schedule),
    1,
  );
  expect(
    (await edit(s, initial.id, { content: "Updated text" })).statusCode,
  ).toBe(202);
  const partial = await settle(s, initial.id);
  expect(
    partial.edit.targets.map(
      (t: { error: { code: string } | null }) => t.error?.code,
    ),
  ).toEqual([undefined, "MISSING_PERMISSION", "MESSAGE_DELETED"]);
  const response = await s.app.inject({
    method: "POST",
    url: `/api/sends/${initial.id}/edits/retry`,
    headers: s.headers,
    payload: {},
  });
  expect(response.statusCode).toBe(202);
  const done = await settle(s, initial.id);
  expect(done.status).toBe("done");
  expect(
    done.targets.every((t: { status: string }) => t.status === "sent"),
  ).toBe(true);
  expect(done.edit.targets.map((t: { status: string }) => t.status)).toEqual([
    "sent",
    "sent",
    "failed",
  ]);
  expect(done.edit.targets[2].error.code).toBe("MESSAGE_DELETED");
  expect(s.fake.messages).toHaveLength(2);
  expect(
    s.fake.messages.every((m) => m.payload.content === "Updated text"),
  ).toBe(true);
});

test("edits retain attachment IDs, remove files explicitly, and clear old text and embeds", async () => {
  const s = await setup();
  const file = await upload(s, "chart.png");
  const initial = await sent(s, [news, results], {
    attachments: [file],
    embeds: [{ ...emptyEmbed(), title: "Old" }],
  });
  const ids = s.fake.messages.map((m) => m.attachments);
  expect(
    (
      await edit(s, initial.id, {
        content: "",
        attachments: [file],
        embeds: [{ ...emptyEmbed(), title: "New" }],
      })
    ).statusCode,
  ).toBe(202);
  await settle(s, initial.id);
  expect(s.fake.messages.map((m) => m.attachments)).toEqual(ids);
  expect(s.fake.messages[0].payload.content).toBe("");
  expect(
    (
      await edit(s, initial.id, {
        content: "Only text",
        attachments: [],
        embeds: [],
      })
    ).statusCode,
  ).toBe(202);
  await settle(s, initial.id);
  for (const message of s.fake.messages) {
    expect(message.payload.attachments).toEqual([]);
    expect(message.payload.embeds).toEqual([]);
  }
});

test("edit routes require authentication and CSRF", async () => {
  const s = await setup();
  const initial = await sent(s, [news]);
  const body = { id: randomUUID(), payload: payload() };
  const anonymous = await s.app.inject({
    method: "PUT",
    url: `/api/sends/${initial.id}`,
    payload: body,
  });
  expect(anonymous.statusCode).toBe(401);
  const noCsrf = await s.app.inject({
    method: "PUT",
    url: `/api/sends/${initial.id}`,
    headers: { cookie: s.headers.cookie, origin: s.headers.origin },
    payload: body,
  });
  expect(noCsrf.statusCode).toBe(403);
});

test("restart makes interrupted edits retryable without changing delivery outcomes", async () => {
  const s = await setup();
  const initial = await sent(s, [news, results]);
  await s.app.close();
  const db = database(s.dir);
  const editId = randomUUID();
  db.prepare("INSERT INTO edit_runs (id, send_id) VALUES (?, ?)").run(
    editId,
    initial.id,
  );
  db.prepare(
    "UPDATE sends SET edit_status = 'sending', edit_id = ?, payload_json = ? WHERE id = ?",
  ).run(
    editId,
    JSON.stringify(payload({ content: "Recovered edit" })),
    initial.id,
  );
  db.prepare(
    "UPDATE send_targets SET edit_status = 'posting' WHERE channel_id = ?",
  ).run(news);
  db.prepare(
    "UPDATE send_targets SET edit_status = 'pending' WHERE channel_id = ?",
  ).run(results);
  db.close();
  const app = await createApp(s.config, { logger: false });
  cleanups.push(() => app.close());
  const resumed = { ...s, app };
  const interrupted = (await read(resumed, initial.id)).json();
  expect(interrupted.status).toBe("done");
  expect(
    interrupted.edit.targets.map((t: { status: string }) => t.status),
  ).toEqual(["failed", "failed"]);
  expect(interrupted.edit.targets[0].error.code).toBe("EDIT_UNCONFIRMED");
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/sends/${initial.id}/edits/retry`,
        headers: s.headers,
        payload: {},
      })
    ).statusCode,
  ).toBe(202);
  const done = await settle(resumed, initial.id);
  expect(done.edit.targets.map((t: { status: string }) => t.status)).toEqual([
    "sent",
    "sent",
  ]);
  expect(s.fake.messages).toHaveLength(2);
  expect(
    s.fake.messages.every((m) => m.payload.content === "Recovered edit"),
  ).toBe(true);
  expect((await edit(resumed, initial.id)).statusCode).toBe(202);
});

test("removing edit attachments preserves files held by templates and other sends", async () => {
  const s = await setup();
  const templateFile = await upload(s, "template.png");
  const otherFile = await upload(s, "other.png");
  const initial = await sent(s, [news], {
    attachments: [templateFile, otherFile],
  });
  await sent(s, [results], { attachments: [otherFile] });
  const template = await s.app.inject({
    method: "POST",
    url: "/api/templates",
    headers: s.headers,
    payload: {
      name: "Bulletin",
      message: { content: "Reusable", embeds: [], attachments: [templateFile] },
    },
  });
  expect(template.statusCode).toBe(201);
  expect((await edit(s, initial.id, { attachments: [] })).statusCode).toBe(202);
  await settle(s, initial.id);
  for (const file of [templateFile, otherFile])
    await s.app.inject({
      method: "DELETE",
      url: `/api/uploads/${file.id}`,
      headers: s.headers,
    });
  const db = database(s.dir);
  try {
    sweepUploads(s.dir, db, 14, Date.now() + 30 * 86400000);
  } finally {
    db.close();
  }
  for (const file of [templateFile, otherFile])
    expect(
      (
        await s.app.inject({
          url: `/api/uploads/${file.id}`,
          headers: s.headers,
        })
      ).statusCode,
    ).toBe(200);
});

test("a replacement upload with the same filename replaces the Discord attachment", async () => {
  const s = await setup();
  const oldFile = await upload(s, "chart.png");
  const initial = await sent(s, [news], { attachments: [oldFile] });
  const oldAttachments = s.fake.messages[0].attachments;
  const replacement = await upload(
    s,
    "chart.png",
    Buffer.concat([png, Buffer.alloc(16)]),
  );
  expect(
    (await edit(s, initial.id, { attachments: [replacement] })).statusCode,
  ).toBe(202);
  await settle(s, initial.id);
  expect(s.fake.messages[0].attachments).not.toEqual(oldAttachments);
  expect(s.fake.messages[0].attachments).toEqual([
    { id: expect.stringMatching(/^\d{17,20}$/), filename: "chart.png" },
  ]);
});

const retryEdit = (s: Setup, id: string, targetIds?: string[]) =>
  s.app.inject({
    method: "POST",
    url: `/api/sends/${id}/edits/retry`,
    headers: s.headers,
    payload: { targetIds },
  });

test("an unconfirmed original post is skipped while confirmed copies remain editable", async () => {
  const s = await setup();
  s.fake.fail(results, { status: 500 });
  const initial = await sent(s, [news, results]);
  expect(initial.targets[1].status).toBe("unknown");
  expect(
    (await edit(s, initial.id, { content: "Current edition" })).statusCode,
  ).toBe(202);
  const done = await settle(s, initial.id);
  expect(done.status).toBe("partial");
  expect(done.targets[1].status).toBe("unknown");
  expect(
    done.edit.targets.map((t: { channelId: string }) => t.channelId),
  ).toEqual([news]);
  expect(s.fake.messages[0].payload.content).toBe("Current edition");
  expect(s.fake.messageReads).toEqual([]);
});

test.each([0, 500, 502, 503, 504])(
  "an edit response failure %s is retryable and preserves delivery status",
  async (status) => {
    const s = await setup();
    const initial = await sent(s, [news]);
    s.fake.fail(news, { status });
    expect((await edit(s, initial.id, { content: "Revised" })).statusCode).toBe(
      202,
    );
    const failed = await settle(s, initial.id);
    expect(failed.status).toBe("done");
    expect(failed.targets[0].status).toBe("sent");
    expect(failed.edit.targets[0].status).toBe("failed");
    expect(failed.edit.targets[0].error.message).not.toMatch(
      /\bposted\b|\bsent\b/,
    );
    expect((await retryEdit(s, initial.id)).statusCode).toBe(202);
    expect((await settle(s, initial.id)).edit.targets[0].status).toBe("sent");
    expect(s.fake.messages).toHaveLength(1);
    expect(s.fake.messages[0].payload.content).toBe("Revised");
  },
);

test("failed original deliveries can post the edited version and are locked during updates", async () => {
  const s = await setup();
  s.fake.fail(results, { status: 503 });
  const initial = await sent(s, [news, results]);
  s.fake.slow(150);
  expect(
    (await edit(s, initial.id, { content: "Current version" })).statusCode,
  ).toBe(202);
  expect((await retry(s, initial.id)).statusCode).toBe(409);
  const updated = await settle(s, initial.id);
  expect(updated.status).toBe("partial");
  expect(updated.targets[1].status).toBe("failed");
  expect(updated.edit.targets).toHaveLength(1);
  expect((await retry(s, initial.id)).statusCode).toBe(202);
  expect((await edit(s, initial.id)).statusCode).toBe(409);
  const done = await settle(s, initial.id);
  expect(done.status).toBe("done");
  expect(
    s.fake.messages.every((m) => m.payload.content === "Current version"),
  ).toBe(true);
});

test("two different edit runs cannot update the same send concurrently", async () => {
  const s = await setup();
  const initial = await sent(s, [news, results]);
  s.fake.slow(100);
  const responses = await Promise.all([
    edit(s, initial.id, { content: "First" }),
    edit(s, initial.id, { content: "Second" }),
  ]);
  expect(responses.map((r) => r.statusCode).sort()).toEqual([202, 409]);
  await settle(s, initial.id);
  expect(new Set(s.fake.messages.map((m) => m.payload.content)).size).toBe(1);
  expect(s.fake.messages).toHaveLength(2);
});

test("an edit cannot claim a send while its initial delivery is running", async () => {
  const s = await setup();
  s.fake.slow(100);
  const response = await post(s, [news, results]);
  expect((await edit(s, response.json().id)).statusCode).toBe(409);
  await settle(s, response.json().id);
});

test("a delivery retry that awaited a listing uses content saved by an intervening edit", async () => {
  const s = await setup();
  await s.app.close();
  const app = Fastify();
  const sqlite = openDatabase(s.dir);
  const discord = createDiscord(s.config);
  const listing = await discord.listGuilds();
  let list = () => Promise.resolve(listing);
  await registerSends(app, s.config, sqlite, {
    ...discord,
    listGuilds: () => list(),
  });
  cleanups.push(async () => {
    await app.close();
    sqlite.close();
  });
  const raw = { ...s, app };
  s.fake.fail(results, { status: 503 });
  const initial = await sent(raw, [news, results]);
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let first = true;
  list = () => {
    if (!first) return Promise.resolve(listing);
    first = false;
    entered();
    return new Promise((resolve) => {
      release = () => resolve(listing);
    });
  };
  const retrying = retry(raw, initial.id).then((r) => r);
  await waiting;
  expect(
    (await edit(raw, initial.id, { content: "Newest content" })).statusCode,
  ).toBe(202);
  await settle(raw, initial.id);
  release();
  expect((await retrying).statusCode).toBe(202);
  expect((await settle(raw, initial.id)).status).toBe("done");
  expect(
    s.fake.messages.every((m) => m.payload.content === "Newest content"),
  ).toBe(true);
});

test("keeping an attachment needs no disk copy and adding another uploads only that file", async () => {
  const s = await setup();
  const kept = await upload(s, "kept.png");
  const initial = await sent(s, [news, results], { attachments: [kept] });
  const oldIds = s.fake.messages.map((m) => m.attachments![0].id);
  unlinkSync(join(s.dir, "uploads", kept.id));
  const added = await upload(s, "added.png");
  expect(
    (await edit(s, initial.id, { attachments: [kept, added] })).statusCode,
  ).toBe(202);
  const done = await settle(s, initial.id);
  expect(
    done.edit.targets.every((t: { status: string }) => t.status === "sent"),
  ).toBe(true);
  s.fake.messages.forEach((m, i) => {
    expect(m.attachments![0].id).toBe(oldIds[i]);
    expect(m.attachments![1]).toEqual({
      id: expect.stringMatching(/^\d{17,20}$/),
      filename: "added.png",
    });
  });
  expect(s.fake.messageReads).toEqual([]);
});

test("legacy copies without stored attachment IDs re-upload safely or refuse missing files", async () => {
  const s = await setup();
  const file = await upload(s, "legacy.png");
  const initial = await sent(s, [news], { attachments: [file] });
  const oldId = s.fake.messages[0].attachments![0].id;
  const db = database(s.dir);
  db.prepare("UPDATE send_targets SET attachments_json = NULL").run();
  db.close();
  expect((await edit(s, initial.id, { attachments: [file] })).statusCode).toBe(
    202,
  );
  await settle(s, initial.id);
  expect(s.fake.messages[0].attachments![0].id).not.toBe(oldId);
  const db2 = database(s.dir);
  db2.prepare("UPDATE send_targets SET attachments_json = NULL").run();
  db2.close();
  unlinkSync(join(s.dir, "uploads", file.id));
  expect((await edit(s, initial.id, { attachments: [file] })).statusCode).toBe(
    422,
  );
  expect(s.fake.messages[0].attachments).toHaveLength(1);
});

test("removing the last reference from an edited send makes its file sweepable", async () => {
  const s = await setup();
  const file = await upload(s, "removed.png");
  const initial = await sent(s, [news], { attachments: [file] });
  expect((await edit(s, initial.id, { attachments: [] })).statusCode).toBe(202);
  await settle(s, initial.id);
  const db = database(s.dir);
  try {
    sweepUploads(s.dir, db, 14, Date.now() + 30 * 86400000);
  } finally {
    db.close();
  }
  expect(
    (await s.app.inject({ url: `/api/uploads/${file.id}`, headers: s.headers }))
      .statusCode,
  ).toBe(404);
});

test("edit preflight does not require send permissions after the message exists", async () => {
  const s = await setup();
  await s.app.close();
  const app = Fastify();
  const sqlite = openDatabase(s.dir);
  const discord = createDiscord(s.config);
  const listing = await discord.listGuilds();
  let readOnly = false;
  await registerSends(app, s.config, sqlite, {
    ...discord,
    listGuilds: async () =>
      readOnly
        ? {
            ...listing,
            guilds: listing.guilds.map((g) => ({
              ...g,
              channels: g.channels.map((c) => ({
                ...c,
                missing: ["sendMessages", "embedLinks"],
              })),
            })),
          }
        : listing,
  });
  cleanups.push(async () => {
    await app.close();
    sqlite.close();
  });
  const raw = { ...s, app };
  const initial = await sent(raw, [news]);
  readOnly = true;
  expect(
    (await edit(raw, initial.id, { content: "Still editable" })).statusCode,
  ).toBe(202);
  expect((await settle(raw, initial.id)).edit.targets[0].status).toBe("sent");
  expect(s.fake.messageReads).toEqual([]);
});

test("fake Discord rejects invented attachment IDs and unmatched new files; omitted attachments stay intact", async () => {
  const s = await setup();
  const file = await upload(s, "chart.png");
  await sent(s, [news], { attachments: [file] });
  const message = s.fake.messages[0];
  const url = `${s.config.discordApiBase}/v10/channels/${news}/messages/${message.id}`;
  const patch = (body: object) =>
    fetch(url, {
      method: "PATCH",
      headers: {
        authorization: "Bot e2e-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const attachments = message.attachments;
  expect(
    (
      await patch({
        attachments: [{ id: "91999999999999999", filename: "chart.png" }],
      })
    ).status,
  ).toBe(400);
  expect(
    (await patch({ attachments: [{ id: 0, filename: "new.png" }] })).status,
  ).toBe(400);
  expect((await patch({ content: "Keep files" })).status).toBe(200);
  expect(message.attachments).toEqual(attachments);
  expect(message.files.map((f) => f.filename)).toEqual(["chart.png"]);
});

test("edit retry routes require authentication and CSRF", async () => {
  const s = await setup();
  const initial = await sent(s, [news]);
  const url = `/api/sends/${initial.id}/edits/retry`;
  expect(
    (await s.app.inject({ method: "POST", url, payload: {} })).statusCode,
  ).toBe(401);
  expect(
    (
      await s.app.inject({
        method: "POST",
        url,
        payload: {},
        headers: { cookie: s.headers.cookie, origin: s.headers.origin },
      })
    ).statusCode,
  ).toBe(403);
});
