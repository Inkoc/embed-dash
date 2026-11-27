import { expect, test } from "vitest";
import {
  botIdentitySchema,
  canPost,
  channelPermissions,
  discordLimits,
  embedTextLength,
  guildsResponseSchema,
  inviteUrl,
  mainChannelId,
  type GuildChannel,
} from "./index.js";
test("validates the public bot identity", () => {
  expect(
    botIdentitySchema.parse({ id: "123", name: "Example bot", avatarUrl: null })
      .name,
  ).toBe("Example bot");
  expect(() => botIdentitySchema.parse({ id: "", name: "" })).toThrow();
});
test("matches Discord's documented embed limits", () => {
  expect(discordLimits).toEqual({
    content: 2000,
    embedsPerMessage: 10,
    title: 256,
    description: 4096,
    fields: 25,
    fieldName: 256,
    fieldValue: 1024,
    footerText: 2048,
    authorName: 256,
    embedTotal: 6000,
  });
});
test("counts every text part of an embed towards the total", () => {
  expect(embedTextLength({})).toBe(0);
  expect(
    embedTextLength({
      title: "Patch",
      description: "Notes",
      fields: [{ name: "When", value: "Thu" }],
      footer: { text: "Team" },
      author: { name: "Dev" },
    }),
  ).toBe(5 + 5 + 4 + 3 + 4 + 3);
});
test("counts characters, not UTF-16 code units", () => {
  expect(embedTextLength({ title: "🏮" })).toBe(1);
});

test("names the permissions to check and builds an invite with them", () => {
  expect(channelPermissions.map((p) => p.label)).toEqual([
    "View Channel",
    "Send Messages",
    "Embed Links",
    "Attach Files",
  ]);
  // 1024 + 2048 + 16384 + 32768
  expect(inviteUrl("42")).toBe(
    "https://discord.com/oauth2/authorize?client_id=42&scope=bot&permissions=52224",
  );
});

test("Attach Files alone doesn't stop the bot posting", () => {
  expect(canPost({ missing: [] })).toBe(true);
  expect(canPost({ missing: ["attachFiles"] })).toBe(true);
  expect(canPost({ missing: ["embedLinks"] })).toBe(false);
});

test("the main channel is the system channel, then announcements, then text", () => {
  const ch = (
    id: string,
    kind: GuildChannel["kind"],
    missing: GuildChannel["missing"] = [],
  ): GuildChannel => ({ id, name: id, kind, missing });
  const channels = [
    ch("forum", "forum"),
    ch("text", "text"),
    ch("news", "announcement"),
    ch("system", "text"),
  ];
  expect(mainChannelId(channels, "system")).toBe("system");
  expect(mainChannelId(channels, null)).toBe("news");
  expect(
    mainChannelId(
      [ch("news", "announcement", ["sendMessages"]), ...channels.slice(0, 2)],
      "gone",
    ),
  ).toBe("text");
  expect(mainChannelId([ch("system", "text", ["viewChannel"])], "system")).toBe(
    null,
  );
});

test("parses the guild list the server returns", () => {
  expect(
    guildsResponseSchema.parse({
      guilds: [
        {
          id: "1",
          name: "Lanternfall",
          iconUrl: null,
          mainChannelId: null,
          channels: [{ id: "2", name: "news", kind: "forum", missing: [] }],
        },
      ],
      unavailable: [],
      fetchedAt: "2026-11-27T10:00:00.000Z",
    }).guilds[0].channels[0].kind,
  ).toBe("forum");
});
