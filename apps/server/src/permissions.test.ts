import { OverwriteType, PermissionFlagsBits } from "discord-api-types/v10";
import { expect, test } from "vitest";
import {
  basePermissions,
  missingPermissions,
  type PermissionContext,
} from "./permissions.js";

const { ViewChannel, SendMessages, EmbedLinks, AttachFiles, Administrator } =
  PermissionFlagsBits;
const posting = ViewChannel | SendMessages | EmbedLinks | AttachFiles;
const guildId = "100";
const botId = "200";
const context = (
  everyone: bigint,
  roles: Record<string, bigint> = {},
  ownerId = "999",
): PermissionContext => ({
  guildId,
  ownerId,
  roles: [
    { id: guildId, permissions: String(everyone) },
    ...Object.entries(roles).map(([id, bits]) => ({
      id,
      permissions: String(bits),
    })),
  ],
  member: { userId: botId, roleIds: Object.keys(roles) },
});
const role = (id: string, allow: bigint, deny = 0n) => ({
  id,
  type: OverwriteType.Role,
  allow: String(allow),
  deny: String(deny),
});
const member = (allow: bigint, deny = 0n) => ({
  id: botId,
  type: OverwriteType.Member,
  allow: String(allow),
  deny: String(deny),
});

test("the owner and administrators bypass every overwrite", () => {
  const deny = [role(guildId, 0n, posting), member(0n, posting)];
  expect(missingPermissions(context(0n, {}, botId), deny)).toEqual([]);
  expect(missingPermissions(context(0n, { "1": Administrator }), deny)).toEqual(
    [],
  );
  expect(basePermissions(context(Administrator))).toBe(~0n);
});

test("base permissions combine @everyone with the member's roles", () => {
  expect(missingPermissions(context(ViewChannel), [])).toEqual([
    "sendMessages",
  ]);
  expect(
    missingPermissions(context(ViewChannel, { "1": SendMessages }), []),
  ).toEqual(["embedLinks", "attachFiles"]);
  expect(missingPermissions(context(posting), [])).toEqual([]);
  expect(missingPermissions(context(0n), [])).toEqual(["viewChannel"]);
});

test("role overwrites apply after @everyone, allows winning over denies", () => {
  // @everyone can't see the channel, but a role the bot has can.
  expect(
    missingPermissions(context(posting, { "1": 0n }), [
      role(guildId, 0n, ViewChannel),
      role("1", ViewChannel),
    ]),
  ).toEqual([]);
  // One role denies Embed Links, another allows it: the allow wins.
  expect(
    missingPermissions(context(posting, { "1": 0n, "2": 0n }), [
      role("1", 0n, EmbedLinks),
      role("2", EmbedLinks),
    ]),
  ).toEqual([]);
  expect(
    missingPermissions(context(posting, { "1": 0n }), [
      role("1", 0n, EmbedLinks),
    ]),
  ).toEqual(["embedLinks"]);
  // Overwrites for roles the bot doesn't have are ignored.
  expect(
    missingPermissions(context(posting), [role("3", 0n, SendMessages)]),
  ).toEqual([]);
});

test("the member overwrite applies last", () => {
  expect(
    missingPermissions(context(posting, { "1": 0n }), [
      role("1", SendMessages),
      member(0n, SendMessages),
    ]),
  ).toEqual(["sendMessages"]);
  expect(
    missingPermissions(context(posting), [
      role(guildId, 0n, ViewChannel),
      member(ViewChannel),
    ]),
  ).toEqual([]);
});

test("without View Channel or Send Messages only that one is named", () => {
  expect(
    missingPermissions(context(posting), [role(guildId, 0n, posting)]),
  ).toEqual(["viewChannel"]);
  expect(
    missingPermissions(context(posting), [
      role(guildId, 0n, SendMessages | EmbedLinks),
    ]),
  ).toEqual(["sendMessages"]);
});
