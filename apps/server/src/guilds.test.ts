import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChannelType, OverwriteType } from "discord-api-types/v10";
import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { guildsResponseSchema } from "@embed-dash/shared";
import { createApp } from "./app.js";
import { sidebarOrder } from "./discord.js";

const token = "guilds-test-token";
const botId = "900";
const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => String(1000 + i));
let guildIds = ids(3);
const requests: string[] = [];
let failGuilds = false;
let dir = "";

const upstream = createServer((req, res) => {
  const url = new URL(req.url!, "http://fake");
  requests.push(url.pathname + url.search);
  res.setHeader("content-type", "application/json");
  if (req.headers.authorization !== `Bot ${token}`) {
    res.statusCode = 401;
    return res.end("{}");
  }
  const send = (body: unknown) => res.end(JSON.stringify(body));
  const path = url.pathname.replace("/api/v10", "");
  if (path === "/users/@me")
    return send({ id: botId, username: "Bot", avatar: null });
  if (path === "/users/@me/guilds") {
    if (failGuilds) {
      res.statusCode = 503;
      return send({ message: token });
    }
    const after = url.searchParams.get("after");
    const limit = Number(url.searchParams.get("limit"));
    const start = after ? guildIds.indexOf(after) + 1 : 0;
    return send(
      guildIds.slice(start, start + limit).map((id) => ({ id, name: id })),
    );
  }
  const [, , guildId, sub] = path.split("/");
  if (!sub)
    return send({
      id: guildId,
      name: `Server ${guildId}`,
      icon: guildId === "1000" ? "abc" : null,
      owner_id: "1",
      system_channel_id: `${guildId}3`,
      roles: [
        { id: guildId, permissions: String((1 << 10) | (1 << 11) | (1 << 14)) },
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
  res.statusCode = 404;
  send({});
});

let listening: Promise<unknown> | undefined;
async function startApp() {
  listening ??= once(upstream.listen(0, "127.0.0.1"), "listening");
  await listening;
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("No address");
  dir = mkdtempSync(join(tmpdir(), "embed-guilds-"));
  return createApp(
    {
      botToken: token,
      host: "127.0.0.1",
      port: 8742,
      dataDir: dir,
      discordApiBase: `http://127.0.0.1:${address.port}/api`,
    },
    { logger: false },
  );
}

beforeEach(() => {
  guildIds = ids(3);
  requests.length = 0;
  failGuilds = false;
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(() => {
  upstream.close();
});

// Discord allows a bot 50 requests a second, and the REST client keeps to it.
test(
  "follows pagination across every server the bot is in",
  { timeout: 30_000 },
  async () => {
    // Enough servers for a second page of /users/@me/guilds (200 per page).
    guildIds = ids(205);
    const app = await startApp();
    try {
      const response = await app.inject("/api/guilds");
      expect(response.statusCode).toBe(200);
      expect(guildsResponseSchema.parse(response.json()).guilds).toHaveLength(
        205,
      );
      expect(
        requests.filter((r) => r.startsWith("/api/v10/users/@me/guilds")),
      ).toEqual([
        "/api/v10/users/@me/guilds?limit=200",
        "/api/v10/users/@me/guilds?limit=200&after=1199",
      ]);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true });
    }
  },
);

test("lists postable channels per server, cached for a minute unless refreshed", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const app = await startApp();
  try {
    const response = await app.inject("/api/guilds");
    expect(response.statusCode).toBe(200);
    const { guilds } = guildsResponseSchema.parse(response.json());
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
        { id: "10002", name: "help", kind: "forum", missing: ["attachFiles"] },
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
    rmSync(dir, { recursive: true });
  }
});

test("a failed listing is reported safely and not cached", async () => {
  const app = await startApp();
  try {
    failGuilds = true;
    const failed = await app.inject("/api/guilds");
    expect(failed.statusCode).toBe(502);
    expect(failed.json().code).toBe("DISCORD_UNAVAILABLE");
    expect(failed.body).not.toContain(token);
    failGuilds = false;
    expect((await app.inject("/api/guilds")).statusCode).toBe(200);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true });
  }
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
