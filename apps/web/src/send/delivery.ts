import type { GuildChannel, MessagePayload } from "@embed-dash/shared";

/** Delivery choices only apply to the destination kinds in this send. */
export function deliveryPayload(
  payload: MessagePayload,
  channels: readonly GuildChannel[],
): MessagePayload {
  const forums = channels.filter((c) => c.kind === "forum");
  const { forumTitle, forumTags, publish, ...message } = payload;
  return {
    ...message,
    ...(forums.length
      ? {
          forumTitle,
          forumTags: Object.fromEntries(
            forums.map((c) => [c.id, forumTags?.[c.id] ?? []]),
          ),
        }
      : {}),
    ...(channels.some((c) => c.kind === "announcement")
      ? { publish: !!publish }
      : {}),
  };
}
