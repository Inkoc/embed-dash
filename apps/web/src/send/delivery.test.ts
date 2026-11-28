import { expect, test } from "vitest";
import type { GuildChannel, MessagePayload } from "@embed-dash/shared";
import { deliveryPayload } from "./delivery";
const message: MessagePayload = {
  content: "Update",
  embeds: [],
  attachments: [],
  pings: [],
  silent: false,
  forumTitle: "Forum title",
  forumTags: { forum: ["123456789012345679"] },
  publish: true,
};
const channel = (kind: GuildChannel["kind"], id = "text"): GuildChannel => ({
  id,
  name: id,
  kind,
  missing: [],
});
test("stale forum and publish choices are omitted for text-only destinations", () => {
  const sent = deliveryPayload(message, [channel("text")]);
  expect(sent).not.toHaveProperty("forumTitle");
  expect(sent).not.toHaveProperty("forumTags");
  expect(sent).not.toHaveProperty("publish");
});
test("mixed destinations carry only the selected forums and announcement publication", () => {
  expect(
    deliveryPayload(message, [
      channel("forum", "forum"),
      channel("announcement"),
    ]),
  ).toMatchObject({
    forumTitle: "Forum title",
    forumTags: { forum: ["123456789012345679"] },
    publish: true,
  });
});
