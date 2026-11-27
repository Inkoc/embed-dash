import type { MessageDraft } from "@embed-dash/shared";

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** What a message holds, in a few words: "2 embeds · 4 fields · 1 file". */
export function messageSummary(message: MessageDraft): string {
  const embeds = message.embeds.length;
  const fields = message.embeds.reduce((n, e) => n + e.fields.length, 0);
  const parts = [embeds === 0 ? "Text only" : count(embeds, "embed", "embeds")];
  if (fields > 0) parts.push(count(fields, "field", "fields"));
  if (message.attachments.length > 0)
    parts.push(count(message.attachments.length, "file", "files"));
  return parts.join(" · ");
}

/** "27 Nov 2026, 14:03" in the reader's own date order. */
export const updatedAt = (iso: string) =>
  new Date(iso).toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
