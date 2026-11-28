import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { channelGroupSchema } from "@embed-dash/shared";
import { fakeGuilds, startFakeDiscord } from "../../../e2e/fake-discord.js";
import { createApp } from "./app.js";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const channel = (guild: number, name: string) =>
  fakeGuilds[guild - 1].channels.find((c) => c.name === name)!.id;
const news = channel(3, "news");
const results = channel(3, "results");
const general = channel(1, "general");
const moderators = channel(1, "moderators");
const bugReports = channel(1, "bug-reports");

async function setup(options: { discordDown?: boolean } = {}) {
  const fake = startFakeDiscord(0);
  await once(fake, "listening");
  const address = fake.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const dir = mkdtempSync(join(tmpdir(), "embed-groups-"));
  const app = await createApp(
    {
      authMode: "password",
      adminPassword: "groups-test-password",
      botToken: "e2e-test-token",
      port: 8742,
      host: "127.0.0.1",
      dataDir: dir,
      maxUploadMb: 10,
      uploadRetentionDays: 14,
      discordApiBase: options.discordDown
        ? "http://127.0.0.1:1/api"
        : `http://127.0.0.1:${address.port}/api`,
    },
    { logger: false },
  );
  cleanups.push(async () => {
    await app.close();
    fake.close();
    rmSync(dir, { recursive: true });
  });
  return { app, fake, headers: await login(app) };
}

async function login(app: FastifyInstance) {
  const first = await app.inject("/api/session");
  const base = { origin: "http://localhost", host: "localhost" };
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: {
      ...base,
      cookie: first.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": first.json().csrfToken as string,
    },
    payload: { password: "groups-test-password" },
  });
  const session = response.cookies.find((c) => c.name === "embed_session")!;
  const cookie = `${session.name}=${session.value}`;
  const next = await app.inject({ url: "/api/session", headers: { cookie } });
  return {
    ...base,
    cookie,
    "x-csrf-token": next.json().csrfToken as string,
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;
const create = ({ app, headers }: Setup, payload: object) =>
  app.inject({
    method: "POST",
    url: "/api/channel-groups",
    headers,
    payload,
  });
const change = ({ app, headers }: Setup, id: string, payload: object) =>
  app.inject({
    method: "PATCH",
    url: `/api/channel-groups/${id}`,
    headers,
    payload,
  });
const list = async ({ app, headers }: Setup) => {
  const response = await app.inject({ url: "/api/channel-groups", headers });
  expect(response.statusCode).toBe(200);
  return channelGroupSchema.array().parse(response.json());
};

test("saves, lists, renames, replaces the channels of and deletes a group", async () => {
  const s = await setup();
  const saved = await create(s, {
    name: "  Cup results ",
    channelIds: [news, results],
  });
  expect(saved.statusCode).toBe(201);
  const group = channelGroupSchema.parse(saved.json());
  expect(group.name).toBe("Cup results");
  expect(group.channels).toEqual([
    {
      id: news,
      name: "news",
      guildId: fakeGuilds[2].id,
      guildName: "Lanternfall Cup EU",
    },
    {
      id: results,
      name: "results",
      guildId: fakeGuilds[2].id,
      guildName: "Lanternfall Cup EU",
    },
  ]);
  await create(s, { name: "announcements everywhere", channelIds: [general] });
  // Listed by name, whatever the case.
  expect((await list(s)).map((g) => g.name)).toEqual([
    "announcements everywhere",
    "Cup results",
  ]);

  const renamed = await change(s, group.id, { name: "Cup EU" });
  expect(renamed.statusCode).toBe(200);
  expect(renamed.json()).toMatchObject({
    name: "Cup EU",
    channels: group.channels,
  });

  const replaced = await change(s, group.id, { channelIds: [general] });
  expect(replaced.statusCode).toBe(200);
  expect(replaced.json()).toMatchObject({
    name: "Cup EU",
    channels: [{ id: general, guildName: "Lanternfall Community" }],
  });

  const deleted = await s.app.inject({
    method: "DELETE",
    url: `/api/channel-groups/${group.id}`,
    headers: s.headers,
  });
  expect(deleted.statusCode).toBe(204);
  expect((await list(s)).map((g) => g.name)).toEqual([
    "announcements everywhere",
  ]);
  expect((await change(s, group.id, { name: "Back" })).json()).toMatchObject({
    code: "GROUP_NOT_FOUND",
  });
});

test("refuses a missing or overlong name and an empty or repeated channel list", async () => {
  const s = await setup();
  const refused = async (payload: object, code: string) => {
    const response = await create(s, payload);
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe(code);
  };
  await refused({ name: " ", channelIds: [news] }, "INVALID_GROUP_NAME");
  await refused(
    { name: "x".repeat(101), channelIds: [news] },
    "INVALID_GROUP_NAME",
  );
  await refused({ name: "Cup", channelIds: [] }, "INVALID_GROUP_CHANNELS");
  await refused(
    { name: "Cup", channelIds: [news, news] },
    "INVALID_GROUP_CHANNELS",
  );
  await refused({ name: "Cup" }, "INVALID_GROUP_CHANNELS");

  const group = (await create(s, { name: "Cup", channelIds: [news] })).json();
  const nothing = await change(s, group.id, {});
  expect(nothing.statusCode).toBe(400);
  const badId = await change(s, "not-a-uuid", { name: "Cup" });
  expect(badId.statusCode).toBe(400);
  expect(await list(s)).toHaveLength(1);
});

test("only saves channels the bot can post to now, and names the ones it can't", async () => {
  const s = await setup();
  const response = await create(s, {
    name: "Mixed",
    channelIds: [news, moderators, bugReports, "1234567890123456789"],
  });
  expect(response.statusCode).toBe(409);
  expect(response.json()).toMatchObject({
    code: "GROUP_CHANNELS_UNAVAILABLE",
    channelIds: [moderators, bugReports, "1234567890123456789"],
  });
  expect(await list(s)).toEqual([]);

  const group = (await create(s, { name: "Cup", channelIds: [news] })).json();
  s.fake.remove(results);
  await s.app.inject({ url: "/api/guilds?refresh=1", headers: s.headers });
  const update = await change(s, group.id, {
    name: "Renamed",
    channelIds: [news, results],
  });
  expect(update.statusCode).toBe(409);
  // Nothing changed, the name included.
  expect((await list(s))[0]).toMatchObject({ name: "Cup" });
});

test("a channel that goes away later stays in the group under its saved name", async () => {
  const s = await setup();
  await create(s, { name: "Cup", channelIds: [news, results] });
  s.fake.remove(results);
  await s.app.inject({ url: "/api/guilds?refresh=1", headers: s.headers });
  const [group] = await list(s);
  expect(group!.channels.map((c) => c.name)).toEqual(["news", "results"]);
});

test("saving says so when Discord can't be reached, and stores nothing", async () => {
  const s = await setup({ discordDown: true });
  const response = await create(s, { name: "Cup", channelIds: [news] });
  expect(response.statusCode).toBe(502);
  expect(response.json().code).toBe("DISCORD_UNREACHABLE");
  expect(await list(s)).toEqual([]);
});

test("every group route needs a session, and changes need the CSRF token", async () => {
  const s = await setup();
  const group = (await create(s, { name: "Cup", channelIds: [news] })).json();
  for (const [method, url] of [
    ["GET", "/api/channel-groups"],
    ["POST", "/api/channel-groups"],
    ["PATCH", `/api/channel-groups/${group.id}`],
    ["DELETE", `/api/channel-groups/${group.id}`],
  ] as const) {
    const response = await s.app.inject({
      method,
      url,
      headers: { origin: "http://localhost", host: "localhost" },
      ...(method === "GET" || method === "DELETE"
        ? {}
        : { payload: { name: "Cup", channelIds: [news] } }),
    });
    expect(response.statusCode).toBe(401);
  }
  const withoutToken: Record<string, string> = { ...s.headers };
  delete withoutToken["x-csrf-token"];
  for (const [method, url] of [
    ["POST", "/api/channel-groups"],
    ["PATCH", `/api/channel-groups/${group.id}`],
    ["DELETE", `/api/channel-groups/${group.id}`],
  ] as const) {
    const response = await s.app.inject({
      method,
      url,
      headers: withoutToken,
      ...(method === "DELETE"
        ? {}
        : { payload: { name: "Other", channelIds: [general] } }),
    });
    expect(response.statusCode).toBe(403);
  }
  expect(await list(s)).toMatchObject([{ name: "Cup" }]);
});

test("refuses a name another group has, whatever the case, on save and on rename", async () => {
  const s = await setup();
  const cup = (await create(s, { name: "Cup EU", channelIds: [news] })).json();
  const other = (
    await create(s, { name: "Community", channelIds: [general] })
  ).json();

  const again = await create(s, { name: " cup eu ", channelIds: [results] });
  expect(again.statusCode).toBe(409);
  expect(again.json()).toEqual({
    code: "GROUP_NAME_TAKEN",
    error: "Another group is already called “Cup EU”.",
  });
  const rename = await change(s, other.id, { name: "CUP EU" });
  expect(rename.statusCode).toBe(409);
  expect(rename.json().code).toBe("GROUP_NAME_TAKEN");
  // A group may change the case of its own name.
  const own = await change(s, cup.id, { name: "CUP EU" });
  expect(own.statusCode).toBe(200);
  expect((await list(s)).map((g) => g.name)).toEqual(["Community", "CUP EU"]);
});

test("holds at most 500 channels per group and 50 groups", async () => {
  const s = await setup();
  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      String(1300000000000000000n + BigInt(i)),
    );
  // 500 passes the bound and is then checked against the listing.
  const atLimit = await create(s, { name: "Big", channelIds: ids(500) });
  expect(atLimit.json().code).toBe("GROUP_CHANNELS_UNAVAILABLE");
  const over = await create(s, { name: "Big", channelIds: ids(501) });
  expect(over.statusCode).toBe(400);
  expect(over.json()).toEqual({
    code: "TOO_MANY_GROUP_CHANNELS",
    error: "A group holds at most 500 channels.",
  });

  for (let i = 1; i <= 50; i++)
    expect(
      (await create(s, { name: `Group ${i}`, channelIds: [news] })).statusCode,
    ).toBe(201);
  const full = await create(s, { name: "Group 51", channelIds: [news] });
  expect(full.statusCode).toBe(409);
  expect(full.json().code).toBe("GROUP_LIMIT_REACHED");
  expect(await list(s)).toHaveLength(50);
});
