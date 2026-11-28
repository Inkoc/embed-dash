import { expect, test } from "vitest";
import type { ChannelGroup, GuildsResponse } from "@embed-dash/shared";
import { groupState } from "./groups";

const listing: GuildsResponse = {
  fetchedAt: "2026-11-28T10:00:00.000Z",
  unavailable: [{ id: "30", name: "Heron Keepers RP" }],
  guilds: [
    {
      id: "10",
      name: "Lanternfall Cup EU",
      iconUrl: null,
      mainChannelId: "11",
      channels: [
        { id: "11", name: "news", kind: "text", missing: [] },
        { id: "12", name: "staff", kind: "text", missing: ["sendMessages"] },
        { id: "13", name: "clips", kind: "forum", missing: [] },
      ],
    },
  ],
};
const saved = (id: string, guildId: string, name = `old-${id}`) => ({
  id,
  name,
  guildId,
  guildName: `saved-${guildId}`,
});

test("checks each saved channel against the listing and keeps the group's order", () => {
  const group: ChannelGroup = {
    id: "00000000-0000-4000-8000-000000000000",
    name: "Cup",
    updatedAt: "2026-11-28T09:00:00.000Z",
    channels: [
      saved("13", "10"),
      saved("11", "10", "announcements"),
      saved("12", "10"),
      saved("14", "10", "brackets"),
      saved("31", "30", "lobby"),
      saved("41", "40", "general"),
    ],
  };
  const state = groupState(group, listing);
  expect(state.available).toEqual(["13", "11"]);
  expect(state.entries).toEqual([
    {
      id: "13",
      name: "clips",
      guildName: "Lanternfall Cup EU",
      unavailable: null,
    },
    // Renamed in Discord since it was saved: the current name wins.
    {
      id: "11",
      name: "news",
      guildName: "Lanternfall Cup EU",
      unavailable: null,
    },
    {
      id: "12",
      name: "staff",
      guildName: "Lanternfall Cup EU",
      unavailable: "Bot is missing Send Messages here",
    },
    {
      id: "14",
      name: "brackets",
      guildName: "Lanternfall Cup EU",
      unavailable: "Channel no longer exists",
    },
    {
      id: "31",
      name: "lobby",
      guildName: "saved-30",
      unavailable: "The bot couldn’t read this server",
    },
    {
      id: "41",
      name: "general",
      guildName: "saved-40",
      unavailable: "The bot is no longer in this server",
    },
  ]);
});
