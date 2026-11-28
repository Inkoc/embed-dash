import { expect, test } from "vitest";
import { emptyEmbed, type MessagePayload } from "./index.js";
import { messageTitle, searchText } from "./index.js";
const payload = (
  content = "",
  embeds: MessagePayload["embeds"] = [],
): MessagePayload => ({
  content,
  embeds,
  attachments: [],
  pings: [],
  silent: false,
});
test("titles prefer a nonblank embed heading over content", () => {
  expect(
    messageTitle(payload("Content", [{ ...emptyEmbed(), title: "Heading" }])),
  ).toBe("Heading");
});
test("titles fall back to the first visible content line", () => {
  expect(messageTitle(payload("\nContent\nSecond", [emptyEmbed()]))).toBe(
    "Content",
  );
});
test("titles fall back to the first visible description line", () => {
  expect(
    messageTitle(
      payload("", [
        emptyEmbed(),
        { ...emptyEmbed(), description: "\nDescription\nSecond" },
      ]),
    ),
  ).toBe("Description");
});
test("titles name messages without visible text", () => {
  expect(messageTitle(payload())).toBe("Untitled message");
});
test("search text folds Unicode at write time", () => {
  expect(searchText(payload("ÉTÉ Αθήνα"))).toBe("été αθήνα");
});

test("schedule dates are limited to a year ahead", async () => {
  const { scheduledAtSchema, scheduleHorizonMs } = await import("./index.js");
  expect(
    scheduledAtSchema.safeParse(
      new Date(Date.now() + scheduleHorizonMs + 60000).toISOString(),
    ).success,
  ).toBe(false);
  expect(
    scheduledAtSchema.safeParse(new Date(Date.now() + 60000).toISOString())
      .success,
  ).toBe(true);
});
