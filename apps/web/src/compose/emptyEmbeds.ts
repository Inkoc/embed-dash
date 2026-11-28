import type { Issue } from "@embed-dash/shared";
import type { Draft } from "./draft";

/**
 * The embeds validation calls empty. That is the one rule that answers for a
 * whole embed (its path is the embed itself, such as `embeds.2`), so it is
 * read from the issues rather than decided a second time here.
 */
export function emptyEmbedIds(draft: Draft, issues: readonly Issue[]) {
  const empty = new Set(
    issues.flatMap((issue) => {
      const match = /^embeds\.(\d+)$/.exec(issue.path);
      return match ? [Number(match[1])] : [];
    }),
  );
  return draft.embeds
    .filter((_, index) => empty.has(index))
    .map((embed) => embed.id);
}

/** Drops the given embeds in one change. */
export const withoutEmbeds = (draft: Draft, ids: readonly string[]): Draft => ({
  ...draft,
  embeds: draft.embeds.filter((embed) => !ids.includes(embed.id)),
});
