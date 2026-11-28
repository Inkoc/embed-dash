import { expect, test } from "vitest";
import { emptyEmbed, messageDraftSchema } from "@embed-dash/shared";
import { withIds } from "../compose/draft";
import { messageSummary } from "./summary";
import { messageSummary as templateSummary } from "../templates/summary";

test("button-only messages have descriptive Send and template summaries", () => {
  const message = messageDraftSchema.parse({
    content: "",
    embeds: [],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: "Guide", url: "https://example.com" },
          {
            type: 2,
            style: 5,
            label: "Status",
            url: "https://example.com/status",
          },
          { type: 2, style: 5, label: "Unfinished", url: "" },
        ],
      },
    ],
  });
  expect(messageSummary(withIds(message))).toMatchObject({
    headline: "Guide",
    parts: "2 buttons",
    buttons: 2,
  });
  expect(templateSummary(message)).toBe("2 buttons");
});

test("button summaries use a label or a resource headline instead of repeating the count", () => {
  const message = messageDraftSchema.parse({
    content: "",
    embeds: [],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: "Guide", url: "https://example.com" },
        ],
      },
    ],
  });
  expect(messageSummary(withIds(message))).toMatchObject({
    headline: "Guide",
    parts: "1 button",
  });
  message.components![0]!.components[0]!.label = "";
  message.components![0]!.components[0]!.emoji = { name: "📖" };
  expect(messageSummary(withIds(message))).toMatchObject({
    headline: "Linked resources",
    parts: "1 button",
  });
});

test("template summaries capitalise text and keep embed fields together before files and buttons", () => {
  const message = messageDraftSchema.parse({
    content: "Resources",
    embeds: [],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: "Guide", url: "https://example.com" },
        ],
      },
    ],
  });
  expect(templateSummary(message)).toBe("Text · 1 button");
  const embed = {
    ...emptyEmbed(),
    title: "Resources",
    fields: [{ name: "Time", value: "Six", inline: false }],
  };
  message.embeds.push(embed);
  message.attachments.push({
    id: "file",
    filename: "guide.txt",
    size: 10,
    contentType: "text/plain",
  });
  expect(templateSummary(message)).toBe(
    "1 embed · 1 field · 1 file · 1 button",
  );
});
