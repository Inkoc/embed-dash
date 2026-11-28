import { validateMessage } from "@embed-dash/shared";
import { expect, test } from "vitest";
import { addEmbed, blankDraft, exampleDraft } from "./draft";
import { emptyEmbedIds, withoutEmbeds } from "./emptyEmbeds";

test("finds every embed validation calls empty, and only those", () => {
  const filled = exampleDraft();
  const draft = addEmbed(addEmbed(filled));
  const ids = emptyEmbedIds(draft, validateMessage(draft));
  expect(ids).toEqual(draft.embeds.slice(-2).map((embed) => embed.id));
  expect(emptyEmbedIds(filled, validateMessage(filled))).toEqual([]);
});

test("drops several empty embeds in one step and keeps the rest in order", () => {
  const draft = addEmbed(addEmbed(exampleDraft()));
  const after = withoutEmbeds(
    draft,
    emptyEmbedIds(draft, validateMessage(draft)),
  );
  expect(after.embeds.map((embed) => embed.title)).toEqual(
    exampleDraft().embeds.map((embed) => embed.title),
  );
  expect(validateMessage(after)).toEqual([]);
});

test("a blank draft's one embed counts as empty", () => {
  const draft = blankDraft();
  expect(emptyEmbedIds(draft, validateMessage(draft))).toEqual([
    draft.embeds[0]!.id,
  ]);
});
