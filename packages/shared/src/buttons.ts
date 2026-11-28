import { z } from "zod";

export const buttonLimits = {
  buttonRows: 5,
  buttonsPerRow: 5,
  buttonLabel: 80,
  buttonUrl: 512,
} as const;

const emojiSegments = new Intl.Segmenter("en", { granularity: "grapheme" });

export const buttonEmojiSchema = z.object({
  name: z.string(),
  id: z.string().optional(),
  animated: z.boolean().optional(),
});
export const linkButtonDraftSchema = z.object({
  type: z.literal(2),
  style: z.literal(5),
  label: z.string().default(""),
  url: z.string(),
  emoji: buttonEmojiSchema.optional(),
});
export const buttonRowDraftSchema = z.object({
  type: z.literal(1),
  components: z.array(linkButtonDraftSchema),
});
export type LinkButtonDraft = z.infer<typeof linkButtonDraftSchema>;
export type ButtonRowDraft = z.infer<typeof buttonRowDraftSchema>;

/** Drafts allow unfinished fields; delivery uses these same checks at the API boundary. */
export function buttonProblems(button: LinkButtonDraft) {
  const problems: { field: "label" | "url" | "emoji"; message: string }[] = [];
  const add = (field: "label" | "url" | "emoji", message: string) =>
    problems.push({ field, message });
  if (!button.label.trim() && !button.emoji)
    add("label", "Add a label or an emoji.");
  if ([...button.label].length > buttonLimits.buttonLabel)
    add("label", `Use at most ${buttonLimits.buttonLabel} characters.`);
  if ([...button.url].length > buttonLimits.buttonUrl)
    add("url", `Use at most ${buttonLimits.buttonUrl} characters.`);
  try {
    const url = new URL(button.url);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    add("url", "Use a full http:// or https:// link.");
  }
  if (button.emoji) {
    const { name, id, animated } = button.emoji;
    const unicode =
      /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3)(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\uFE0F|\u200D|[\u{E0020}-\u{E007F}])*$/u;
    if (
      id !== undefined
        ? !/^\d{17,20}$/.test(id) || !name.trim()
        : !unicode.test(name) ||
          [...emojiSegments.segment(name)].length !== 1 ||
          animated === true
    )
      add(
        "emoji",
        "Use a Unicode emoji or a custom emoji with a name and valid Discord ID.",
      );
  }
  return problems;
}

export const linkButtonSchema = linkButtonDraftSchema.superRefine(
  (button, ctx) => {
    for (const problem of buttonProblems(button))
      ctx.addIssue({
        code: "custom",
        path: [problem.field],
        message: problem.message,
      });
  },
);
export const buttonRowsSchema = z
  .array(
    z.object({
      type: z.literal(1),
      components: z
        .array(linkButtonSchema)
        .min(1)
        .max(buttonLimits.buttonsPerRow),
    }),
  )
  .max(buttonLimits.buttonRows);

/** An explicit allowlist strips editor keys and excludes unfinished buttons from portable messages. */
export function completeButtonRows(
  rows: readonly ButtonRowDraft[] = [],
): ButtonRowDraft[] {
  return rows
    .map((row) => ({
      type: 1 as const,
      components: row.components
        .filter((button) => buttonProblems(button).length === 0)
        .map((button) => linkButtonDraftSchema.parse(button)),
    }))
    .filter((row) => row.components.length > 0);
}
