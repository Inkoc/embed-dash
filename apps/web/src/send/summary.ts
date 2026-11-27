import type { SendResult, SendTarget } from "@embed-dash/shared";
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
  /** The first embed's side colour, so the summary can be told apart at a glance. */
  color: string | null;
  text: boolean;
  embeds: number;
  files: number;
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
  return {
    headline,
    parts: parts.join(" · "),
    color: draft.embeds[0]?.color || null,
    text: !!draft.content.trim(),
    embeds: draft.embeds.length,
    files: draft.attachments.length,
  };
}

/** A copy that has no outcome yet: queued, or its post is under way. */
export const inFlight = (target: Pick<SendTarget, "status">) =>
  target.status === "pending" || target.status === "posting";

/** How many of the copies being delivered (all, or the ones being retried) have an outcome. */
export function progress(
  result: SendResult,
  retrying: ReadonlySet<string> | null,
) {
  const copies = retrying
    ? result.targets.filter((target) => retrying.has(target.id))
    : result.targets;
  return {
    done: copies.filter((target) => !inFlight(target)).length,
    total: copies.length,
  };
}

/** The tally of a send, as a sentence the summary line can open with. */
export function tally(result: SendResult) {
  const count = (status: string) =>
    result.targets.filter((t) => t.status === status).length;
  const sent = count("sent");
  const failed = count("failed");
  const unknown = count("unknown");
  const pending = result.targets.filter(inFlight).length;
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
    pending,
    // Mid-delivery the total is what matters; once done, what happened to each kind.
    sentence: pending
      ? `${sent} of ${result.targets.length} sent${failed ? `, ${failed} failed` : ""}.`
      : `${parts.join(", ")}.`,
  };
}
