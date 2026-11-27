import { expect, test } from "vitest";
import type { Guild } from "@embed-dash/shared";
import {
  callNumberStrongFrom,
  findRanges,
  initials,
  searchCatalogue,
  searchTerms,
  segments,
} from "./catalogue";

const guild = (id: string, name: string, channels: string[]): Guild => ({
  id,
  name,
  iconUrl: null,
  mainChannelId: null,
  channels: channels.map((channel, i) => ({
    id: `${id}${i}`,
    name: channel,
    kind: "text",
    missing: [],
  })),
});
const guilds = [
  guild("1100", "Lanternfall Community", ["announcements", "news", "general"]),
  guild("2200", "Lanternfall Cup EU", ["news", "results"]),
  guild("3300", "Saltmarsh Wiki", ["edits"]),
];
const names = (query: string) =>
  searchCatalogue(guilds, query).map(
    (d) =>
      `${d.guild.name}: ${d.channels.map((h) => h.channel.name).join(",")}`,
  );

test("an empty search lists every server and channel", () => {
  expect(names("  ")).toHaveLength(3);
  expect(searchCatalogue(guilds, "")[0].channels).toHaveLength(3);
});

test("matches channel names, ignoring case and a leading #", () => {
  expect(names("#NEWS")).toEqual([
    "Lanternfall Community: news",
    "Lanternfall Cup EU: news",
  ]);
});

test("a server name match lists all of that server's channels", () => {
  expect(names("saltmarsh")).toEqual(["Saltmarsh Wiki: edits"]);
});

test("matches channel and server IDs", () => {
  expect(names("22001")).toEqual(["Lanternfall Cup EU: results"]);
  expect(names("3300")).toEqual(["Saltmarsh Wiki: edits"]);
});

test("every term has to match somewhere", () => {
  expect(names("news cup")).toEqual(["Lanternfall Cup EU: news"]);
  expect(names("news wiki")).toEqual([]);
});

test("marks hits in names and call numbers", () => {
  const [drawer] = searchCatalogue(guilds, "lantern 11001");
  expect(drawer.name).toEqual([[0, 7]]);
  expect(drawer.channels).toHaveLength(1);
  expect(drawer.channels[0].id).toEqual([[0, 5]]);
  // Touching ranges merge into one mark.
  expect(findRanges("announcements", ["n", "nou"])).toEqual([
    [1, 6],
    [10, 11],
  ]);
  expect(findRanges("aaaa", ["aa"])).toEqual([[0, 4]]);
  expect(searchTerms(" #a  B ")).toEqual(["a", "b"]);
});

test("segments split text into marked and strong runs", () => {
  const id = "110348291550100004";
  expect(callNumberStrongFrom(id)).toBe(12);
  expect(segments(id, [[10, 14]], 12)).toEqual([
    { text: "1103482915", mark: false, strong: false },
    { text: "50", mark: true, strong: false },
    { text: "10", mark: true, strong: true },
    { text: "0004", mark: false, strong: true },
  ]);
  expect(segments("news", [])).toEqual([
    { text: "news", mark: false, strong: false },
  ]);
});

test("label holders carry two initials", () => {
  expect(initials("Lanternfall Modding Guild")).toBe("LM");
  expect(initials("saltmarsh")).toBe("SA");
  expect(initials("— ✨ —")).toBe("?");
  expect(initials("Équipe 7")).toBe("É7");
});
