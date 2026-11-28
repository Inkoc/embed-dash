import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChannelType, OverwriteType } from "discord-api-types/v10";
import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { guildsResponseSchema } from "@embed-dash/shared";
import { createApp } from "./app.js";
import type { Config } from "./config.js";
import { createDiscord, sidebarOrder } from "./discord.js";

const token = "guilds-test-token";
const botId = "900";
const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => String(1000 + i));
let guildIds = ids(3);
/** Guild ID → HTTP status its detail requests fail with. */
let guildFailures = new Map<string, number>();
let failGuildList = false;
/** Guild IDs whose detail requests answer late. */
let slowGuilds = new Set<string>();
const requests: string[] = [];
const dirs: string[] = [];

const upstream = createServer((req, res) => {
  const url = new URL(req.url!, "http://fake");
  requests.push(url.pathname + url.search);
  res.setHeader("content-type", "application/json");
  const send = (body: unknown, status = 200) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== `Bot ${token}`) return send({}, 401);
  const path = url.pathname.replace("/api/v10", "");
  if (path === "/users/@me")
    return send({ id: botId, username: "Bot", avatar: null });
  if (path === "/users/@me/guilds") {
    if (failGuildList) return send({ message: token }, 503);
    const after = url.searchParams.get("after");
    const limit = Number(url.searchParams.get("limit"));
    const start = after ? guildIds.indexOf(after) + 1 : 0;
    return send(
      guildIds
        .slice(start, start + limit)
        .map((id) => ({ id, name: `Server ${id}` })),
    );
  }
  const [, , guildId, sub] = path.split("/");
  const failure = guildFailures.get(guildId);
  if (failure)
    return void setTimeout(
      () => send({ message: "Missing Access" }, failure),
      slowGuilds.has(guildId) ? 100 : 0,
    );
  if (!sub)
    return send({
      id: guildId,
      name: `Server ${guildId}`,
      icon: guildId === "1000" ? "abc" : null,
      owner_id: "1",
      system_channel_id: `${guildId}3`,
      roles: [
        {
          id: guildId,
          permissions: String((1 << 10) | (1 << 11) | (1 << 14)),
        },
      ],
    });
  if (sub === "members") return send({ roles: [] });
  if (sub === "channels")
    return send([
      { id: `${guildId}9`, type: ChannelType.GuildCategory, position: 0 },
      {
        id: `${guildId}3`,
        type: ChannelType.GuildText,
        name: "staff",
        position: 0,
        parent_id: `${guildId}9`,
        permission_overwrites: [
          {
            id: guildId,
            type: OverwriteType.Role,
            allow: "0",
            deny: String(1 << 11),
          },
        ],
      },
      {
        id: `${guildId}2`,
        type: ChannelType.GuildForum,
        name: "help",
        position: 1,
        parent_id: `${guildId}9`,
      },
      {
        id: `${guildId}5`,
        type: ChannelType.GuildVoice,
        name: "voice",
        position: 0,
      },
      {
        id: `${guildId}1`,
        type: ChannelType.GuildAnnouncement,
        name: "news",
        position: 3,
      },
    ]);
  send({}, 404);
});

let listening: Promise<unknown> | undefined;
async function config(authMode: Config["authMode"] = "none"): Promise<Config> {
  listening ??= once(upstream.listen(0, "127.0.0.1"), "listening");
  await listening;
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const dataDir = mkdtempSync(join(tmpdir(), "embed-guilds-"));
  dirs.push(dataDir);
  return {
    botToken: token,
    authMode,
    adminPassword: "guilds-test-password",
    maxUploadMb: 10,
    uploadRetentionDays: 14,
    host: "127.0.0.1",
    port: 8742,
    dataDir,
    discordApiBase: `http://127.0.0.1:${address.port}/api`,
  };
}
const guildRequests = () =>
  requests.filter((r) => r.startsWith("/api/v10/guilds/")).length;

beforeEach(() => {
  guildIds = ids(3);
  guildFailures = new Map();
  failGuildList = false;
  slowGuilds = new Set();
  requests.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(() => {
  upstream.close();
  for (const dir of dirs) rmSync(dir, { recursive: true });
});

test("lists postable channels per server, cached for a minute unless refreshed", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const app = await createApp(await config(), { logger: false });
  try {
    const response = await app.inject("/api/guilds");
    expect(response.statusCode).toBe(200);
    const { guilds, unavailable } = guildsResponseSchema.parse(response.json());
    expect(unavailable).toEqual([]);
    expect(guilds.map((g) => g.id)).toEqual(["1000", "1001", "1002"]);
    expect(guilds[0]).toEqual({
      id: "1000",
      name: "Server 1000",
      iconUrl: "https://cdn.discordapp.com/icons/1000/abc.png?size=64",
      // The system channel is closed to the bot, so the announcement channel is main.
      mainChannelId: "10001",
      channels: [
        {
          id: "10001",
          name: "news",
          kind: "announcement",
          missing: ["attachFiles"],
        },
        { id: "10003", name: "staff", kind: "text", missing: ["sendMessages"] },
        {
          id: "10002",
          name: "help",
          kind: "forum",
          missing: [
            "attachFiles",
            "createPublicThreads",
            "sendMessagesInThreads",
          ],
          availableTags: [],
          requireTag: false,
        },
      ],
    });
    expect(guilds[1].iconUrl).toBeNull();

    const calls = requests.length;
    await app.inject("/api/guilds");
    expect(requests.length).toBe(calls);
    vi.setSystemTime(Date.now() + 61_000);
    await app.inject("/api/guilds");
    expect(requests.length).toBe(calls * 2);
    await app.inject("/api/guilds?refresh=1");
    expect(requests.length).toBe(calls * 3);
  } finally {
    await app.close();
  }
});

test("the listing sits behind the login", async () => {
  const app = await createApp(await config("password"), { logger: false });
  try {
    const response = await app.inject("/api/guilds");
    expect(response.statusCode).toBe(401);
    expect(requests).toEqual([]);
  } finally {
    await app.close();
  }
});

test("a failed listing is reported safely, and a failed refresh keeps the last list", async () => {
  const app = await createApp(await config(), { logger: false });
  try {
    failGuildList = true;
    const failed = await app.inject("/api/guilds");
    expect(failed.statusCode).toBe(502);
    expect(failed.json().code).toBe("DISCORD_UNAVAILABLE");
    expect(failed.body).not.toContain(token);
    // Failures are never cached.
    failGuildList = false;
    const good = await app.inject("/api/guilds");
    expect(good.statusCode).toBe(200);

    failGuildList = true;
    expect((await app.inject("/api/guilds?refresh=1")).statusCode).toBe(502);
    const kept = await app.inject("/api/guilds");
    expect(kept.statusCode).toBe(200);
    expect(kept.json()).toEqual(good.json());
  } finally {
    await app.close();
  }
});

test("follows pagination across every page of servers", async () => {
  guildIds = ids(5);
  const discord = createDiscord(await config(), { guildPageSize: 2 });
  const { guilds } = await discord.listGuilds();
  expect(guilds.map((g) => g.id)).toEqual(ids(5));
  expect(
    requests.filter((r) => r.startsWith("/api/v10/users/@me/guilds")),
  ).toEqual([
    "/api/v10/users/@me/guilds?limit=2",
    "/api/v10/users/@me/guilds?limit=2&after=1001",
    "/api/v10/users/@me/guilds?limit=2&after=1003",
  ]);
});

test("concurrent listings, refreshes included, share one fetch", async () => {
  const discord = createDiscord(await config());
  const results = await Promise.all([
    discord.listGuilds({ refresh: true }),
    discord.listGuilds({ refresh: true }),
    discord.listGuilds(),
  ]);
  expect(new Set(results).size).toBe(1);
  expect(guildRequests()).toBe(3 * 3);
});

test("a plain read gets the fresh cached list while a refresh is running", async () => {
  const discord = createDiscord(await config());
  const first = await discord.listGuilds();
  failGuildList = true;
  const refresh = discord.listGuilds({ refresh: true });
  expect(await discord.listGuilds()).toBe(first);
  await expect(refresh).rejects.toThrow();
});

test("servers the bot can no longer read are reported in list order, not fatal", async () => {
  guildFailures = new Map([
    ["1000", 403],
    ["1002", 404],
  ]);
  // The first one answers last, so completion order differs from list order.
  slowGuilds = new Set(["1000"]);
  const discord = createDiscord(await config());
  const result = await discord.listGuilds();
  expect(result.guilds.map((g) => g.id)).toEqual(["1001"]);
  expect(result.unavailable).toEqual([
    { id: "1000", name: "Server 1000" },
    { id: "1002", name: "Server 1002" },
  ]);
});

test("a fatal failure stops the remaining servers from being fetched", async () => {
  guildIds = ids(40);
  guildFailures = new Map([["1000", 400]]);
  const discord = createDiscord(await config());
  await expect(discord.listGuilds()).rejects.toThrow();
  // Only the servers already started when the failure landed were requested.
  expect(guildRequests()).toBeLessThan(4 * 3 * 2);
});

test("sidebar order: uncategorised first, then categories, by position then ID", () => {
  const c = (
    id: string,
    position: number,
    parent_id: string | null = null,
    type = ChannelType.GuildText,
  ) => ({
    id,
    position,
    parent_id,
    type,
  });
  expect(
    sidebarOrder([
      c("20", 1, null, ChannelType.GuildCategory),
      c("10", 0, null, ChannelType.GuildCategory),
      c("5", 0, "20"),
      c("4", 2, "10"),
      c("3", 1, "10"),
      c("2", 5),
      c("7", 0, "gone"),
      c("1", 5),
    ]).map((x) => x.id),
  ).toEqual(["7", "1", "2", "3", "4", "5"]);
});
