import type { SendResult } from "@embed-dash/shared";
import type { Draft } from "../compose/draft";

export const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const excerpt = (text: string, max = 80) => {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max).trimEnd()}…` : line;
};

/** What the operator is about to post, in a line they can recognise it by. */
export function messageSummary(draft: Draft): {
  headline: string;
  parts: string;
} {
  const first = draft.embeds.find((embed) => embed.title.trim());
  const headline =
    (first && excerpt(first.title)) ||
    excerpt(draft.content) ||
    excerpt(
      draft.embeds.find((e) => e.description.trim())?.description ?? "",
    ) ||
    "Untitled message";
  const parts = [
    draft.content.trim() ? "text" : null,
    draft.embeds.length ? plural(draft.embeds.length, "embed", "embeds") : null,
    draft.attachments.length
      ? plural(draft.attachments.length, "file", "files")
      : null,
  ].filter(Boolean);
  return { headline, parts: parts.join(" · ") };
}

/** The tally of a send, as a sentence the summary line can open with. */
export function tally(result: SendResult) {
  const count = (status: string) =>
    result.targets.filter((t) => t.status === status).length;
  const sent = count("sent");
  const failed = count("failed");
  const unknown = count("unknown");
  const parts = [
    `${sent} sent`,
    failed ? `${failed} failed` : null,
    unknown ? `${unknown} unconfirmed` : null,
  ].filter(Boolean);
  return {
    sent,
    failed,
    unknown,
    stoppedByToken: result.targets.some(
      (t) => t.error?.code === "INVALID_TOKEN",
    ),
    sentence: `${parts.join(", ")}.`,
  };
}
