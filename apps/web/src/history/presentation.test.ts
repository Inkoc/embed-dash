import { expect, test } from "vitest";
import {
  destinationSummary,
  historyRequest,
  localDateBound,
  date,
} from "./presentation";

test("local date ranges send midnight instants with the final day included", () => {
  const params = historyRequest(
    new URLSearchParams("from=2026-11-28&to=2026-11-28&q=patch"),
  );
  expect(new Date(params.get("from")!).getHours()).toBe(0);
  expect(new Date(params.get("to")!).getDate()).toBe(29);
  expect(params.get("q")).toBe("patch");
  expect(date(Date.parse(params.get("from")!))).toMatch(/2026/);
});
test("date bounds follow calendar days through daylight saving changes", () => {
  for (const day of ["2026-03-29", "2026-10-25"]) {
    const start = new Date(localDateBound(day));
    const end = new Date(localDateBound(day, true));
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(0);
    expect(end.getTime() - start.getTime()).toBe(
      86400000 + (end.getTimezoneOffset() - start.getTimezoneOffset()) * 60000,
    );
  }
});
test("destinations group by server, cap copies and prioritize a search match", () => {
  const targets = ["general", "news", "events", "patch"].map(
    (channelName, i) => ({
      guildId: "guild",
      guildName: "Observatory",
      channelId: String(i),
      channelName,
    }),
  );
  expect(destinationSummary(targets, "patch")).toBe(
    "Observatory: #patch, #general, #news · +1 more",
  );
});
