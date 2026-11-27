import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, truncateSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { emptyEmbed, type MessagePayload } from "@embed-dash/shared";
import { fakeGuilds, startFakeDiscord } from "../../../e2e/fake-discord.js";
import { createApp } from "./app.js";
import type { Config } from "./config.js";
import { openDatabase } from "./db.js";
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
    if (send.status !== "sending") return send;
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

test("a restart marks copies that were still pending as unknown", async () => {
  const s = await setup();
  const done = await sent(s, [news]);
  const db = openDatabase(s.dir);
  db.prepare(
    "INSERT INTO sends (id, payload_json, search_text, status, created_at, updated_at) VALUES ('cut-off', '{}', '', 'sending', 1, 1)",
  ).run();
  const insert = db.prepare(
    "INSERT INTO send_targets (id, send_id, guild_id, guild_name, channel_id, channel_name, status, position) VALUES (?, 'cut-off', 'g', 'G', ?, 'c', ?, ?)",
  );
  insert.run("t1", "1", "sent", 0);
  insert.run("t2", "2", "pending", 1);
  insert.run("t3", "3", "pending", 2);
  db.close();
  await s.app.close();
  const restarted = await createApp(
    { ...s.config, dataDir: s.dir },
    { logger: false },
  );
  cleanups.push(() => restarted.close());
  expect(
    rows(
      s.dir,
      "SELECT id, status, error FROM send_targets WHERE send_id = 'cut-off' ORDER BY position",
    ),
  ).toEqual([
    { id: "t1", status: "sent", error: null },
    { id: "t2", status: "unknown", error: "UNKNOWN_OUTCOME" },
    { id: "t3", status: "unknown", error: "UNKNOWN_OUTCOME" },
  ]);
  expect(rows(s.dir, "SELECT status FROM sends WHERE id = 'cut-off'")).toEqual([
    { status: "partial" },
  ]);
  expect(
    rows(s.dir, `SELECT status FROM sends WHERE id = '${done.id}'`),
  ).toEqual([{ status: "done" }]);
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
