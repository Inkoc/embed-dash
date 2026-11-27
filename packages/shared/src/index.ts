import { z } from "zod";
export const botIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.url().nullable(),
});
export type BotIdentity = z.infer<typeof botIdentitySchema>;

/** Discord's message and embed limits, in characters unless noted. */
export const discordLimits = {
  content: 2000,
  embedsPerMessage: 10,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  authorName: 256,
  /** Title, description, field names and values, footer text and author name, across every embed. */
  embedTotal: 6000,
} as const;

/**
 * A message as the composer holds it: every text part is a plain string (empty
 * when unused), so the draft can be invalid while someone is still typing.
 * `validateMessage` says what has to change before Discord would accept it.
 */
export const embedFieldSchema = z.object({
  name: z.string(),
  value: z.string(),
  inline: z.boolean(),
});
export const embedDraftSchema = z.object({
  /** `#rrggbb`, or whatever is half-typed in the hex box. */
  color: z.string(),
  title: z.string(),
  url: z.string(),
  description: z.string(),
  author: z.object({ name: z.string(), url: z.string(), iconUrl: z.string() }),
  fields: z.array(embedFieldSchema),
  image: z.string(),
  thumbnail: z.string(),
  footer: z.object({ text: z.string(), iconUrl: z.string() }),
  /** Empty for none, `now` for the moment of sending, or an ISO 8601 date-time. */
  timestamp: z.string(),
});
export const messageDraftSchema = z.object({
  content: z.string(),
  embeds: z.array(embedDraftSchema),
});
export type EmbedFieldDraft = z.infer<typeof embedFieldSchema>;
export type EmbedDraft = z.infer<typeof embedDraftSchema>;
export type MessageDraft = z.infer<typeof messageDraftSchema>;

/** Discord counts Unicode characters, so an emoji is one character, not two UTF-16 units. */
export function textLength(text: string): number {
  return [...text].length;
}

/** Discord trims leading and trailing whitespace before it applies the embed text limits. */
export function countedLength(text: string): number {
  return textLength(text.trim());
}

export interface EmbedTextParts {
  title?: string;
  description?: string;
  fields?: readonly { name: string; value: string }[];
  footer?: { text: string };
  author?: { name: string };
}

/** Characters one embed adds to Discord's 6,000-character total. */
export function embedTextLength(embed: EmbedTextParts): number {
  const parts = [
    embed.title,
    embed.description,
    embed.footer?.text,
    embed.author?.name,
    ...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
  ];
  return parts.reduce((total, part) => total + countedLength(part ?? ""), 0);
}

/** The 6,000-character limit covers every embed in the message together. */
export function messageEmbedTextLength(
  embeds: readonly EmbedTextParts[],
): number {
  return embeds.reduce((total, embed) => total + embedTextLength(embed), 0);
}

export const emptyEmbed = (): EmbedDraft => ({
  color: "#0d9488",
  title: "",
  url: "",
  description: "",
  author: { name: "", url: "", iconUrl: "" },
  fields: [],
  image: "",
  thumbnail: "",
  footer: { text: "", iconUrl: "" },
  timestamp: "",
});

export interface Issue {
  /** Dotted path to the part that needs the fix, such as `embeds.0.fields.2.value`. */
  path: string;
  /** Names the part, such as "Embed 1, field 3 value". */
  label: string;
  /** What is wrong and how to fix it. */
  message: string;
}

const format = (n: number) => n.toLocaleString("en-GB");
const characters = (n: number) =>
  `${format(n)} ${n === 1 ? "character" : "characters"}`;
const hexColor = /^#[0-9a-f]{6}$/i;

/**
 * Title and author links open in a browser, so they must be web links; images
 * and icons may also point at a file uploaded with the message.
 */
function linkProblem(url: string, media: boolean): string | null {
  const value = url.trim();
  if (!value) return null;
  const schemes = media
    ? ["http:", "https:", "attachment:"]
    : ["http:", "https:"];
  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    return media
      ? "Use a full link that starts with https://, or attachment:// for an uploaded file."
      : "Use a full link that starts with https://.";
  }
  if (schemes.includes(protocol)) return null;
  return media
    ? `Discord only shows images from https://, http:// or attachment:// links, not ${protocol}//.`
    : `Discord only accepts https:// or http:// links here, not ${protocol}//.`;
}

function hasContent(embed: EmbedDraft) {
  return (
    [
      embed.title,
      embed.description,
      embed.author.name,
      embed.footer.text,
      embed.image,
      embed.thumbnail,
    ].some((part) => part.trim() !== "") || embed.fields.length > 0
  );
}

/** Every reason Discord would reject the message, in the order the form shows the parts. */
export function validateMessage(message: MessageDraft): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, label: string, text: string) =>
    issues.push({ path, label, message: text });
  const limit = (
    path: string,
    label: string,
    text: string,
    max: number,
    length = countedLength(text),
  ) => {
    if (length > max)
      add(
        path,
        label,
        `${characters(length - max)} over the ${format(max)} limit.`,
      );
  };
  const link = (path: string, label: string, url: string, media: boolean) => {
    const problem = linkProblem(url, media);
    if (problem) add(path, label, problem);
  };

  if (!message.content.trim() && message.embeds.length === 0)
    add("content", "Message", "Add message text or an embed.");
  limit(
    "content",
    "Message text",
    message.content,
    discordLimits.content,
    textLength(message.content),
  );
  if (message.embeds.length > discordLimits.embedsPerMessage)
    add(
      "embeds",
      "Embeds",
      `A message holds at most ${discordLimits.embedsPerMessage} embeds; remove ${message.embeds.length - discordLimits.embedsPerMessage}.`,
    );

  message.embeds.forEach((embed, e) => {
    const at = `embeds.${e}`;
    const name = `Embed ${e + 1}`;
    if (!hasContent(embed)) {
      add(
        at,
        name,
        "This embed is empty. Add a title, description, field, author, footer or image, or remove it.",
      );
    }
    if (!hexColor.test(embed.color))
      add(
        `${at}.color`,
        `${name} side colour`,
        "Use a six-digit hex colour, such as #0D9488.",
      );
    limit(`${at}.title`, `${name} title`, embed.title, discordLimits.title);
    link(`${at}.url`, `${name} title link`, embed.url, false);
    limit(
      `${at}.description`,
      `${name} description`,
      embed.description,
      discordLimits.description,
    );
    if (embed.fields.length > discordLimits.fields)
      add(
        `${at}.fields`,
        `${name} fields`,
        `An embed holds at most ${discordLimits.fields} fields; remove ${embed.fields.length - discordLimits.fields}.`,
      );
    embed.fields.forEach((field, f) => {
      const fieldAt = `${at}.fields.${f}`;
      const fieldName = `${name}, field ${f + 1}`;
      if (!field.name.trim())
        add(
          `${fieldAt}.name`,
          `${fieldName} name`,
          "Add a name; Discord rejects a field without one.",
        );
      limit(
        `${fieldAt}.name`,
        `${fieldName} name`,
        field.name,
        discordLimits.fieldName,
      );
      if (!field.value.trim())
        add(
          `${fieldAt}.value`,
          `${fieldName} value`,
          "Add a value; Discord rejects a field without one.",
        );
      limit(
        `${fieldAt}.value`,
        `${fieldName} value`,
        field.value,
        discordLimits.fieldValue,
      );
    });
    limit(
      `${at}.author.name`,
      `${name} author name`,
      embed.author.name,
      discordLimits.authorName,
    );
    if (
      !embed.author.name.trim() &&
      (embed.author.url.trim() || embed.author.iconUrl.trim())
    )
      add(
        `${at}.author.name`,
        `${name} author name`,
        "Add an author name; Discord drops the author link and icon without one.",
      );
    link(`${at}.author.url`, `${name} author link`, embed.author.url, false);
    link(
      `${at}.author.iconUrl`,
      `${name} author icon`,
      embed.author.iconUrl,
      true,
    );
    link(`${at}.image`, `${name} image`, embed.image, true);
    link(`${at}.thumbnail`, `${name} thumbnail`, embed.thumbnail, true);
    limit(
      `${at}.footer.text`,
      `${name} footer text`,
      embed.footer.text,
      discordLimits.footerText,
    );
    if (!embed.footer.text.trim() && embed.footer.iconUrl.trim())
      add(
        `${at}.footer.text`,
        `${name} footer text`,
        "Add footer text; Discord drops the footer icon without it.",
      );
    link(
      `${at}.footer.iconUrl`,
      `${name} footer icon`,
      embed.footer.iconUrl,
      true,
    );
    if (
      embed.timestamp &&
      embed.timestamp !== "now" &&
      Number.isNaN(Date.parse(embed.timestamp))
    )
      add(
        `${at}.timestamp`,
        `${name} time`,
        "Pick a date and time, or choose the time of sending.",
      );
  });

  const total = messageEmbedTextLength(message.embeds);
  if (total > discordLimits.embedTotal)
    add(
      "embeds",
      "All embed text",
      `${characters(total - discordLimits.embedTotal)} over the ${format(discordLimits.embedTotal)} limit for all embeds together.`,
    );
  return issues;
}
