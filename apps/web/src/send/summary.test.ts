import { expect, test } from "vitest";
import { messageDraftSchema } from "@embed-dash/shared";
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
    headline: "2 buttons",
    parts: "2 buttons",
    buttons: 2,
  });
  expect(templateSummary(message)).toBe("2 buttons");
});
