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
/** A file already stored on the server, referenced by id; `filename` is what `attachment://` points at. */
export const attachmentSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentType: z.string(),
});
export const messageDraftSchema = z.object({
  content: z.string(),
  embeds: z.array(embedDraftSchema),
  attachments: z.array(attachmentSchema).default([]),
});
export type AttachmentDraft = z.infer<typeof attachmentSchema>;
export type EmbedFieldDraft = z.infer<typeof embedFieldSchema>;
export type EmbedDraft = z.infer<typeof embedDraftSchema>;
export type MessageDraft = z.infer<typeof messageDraftSchema>;

export const uploadLimits = {
  attachmentsPerMessage: 10,
  /** All files of one message together. */
  messageBytes: 25 * 1024 * 1024,
  defaultFileMb: 10,
  maxFileMb: 25,
} as const;

const maxFilenameLength = 100;

/**
 * Turns whatever the browser reports into a name Discord's `attachment://`
 * matching accepts: ASCII letters, digits, dots, dashes and underscores. The
 * extension survives truncation, and a leading dot is dropped so the file is
 * never hidden or made only of dots.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^\.+/, "");
  if (!cleaned || /^[._-]+$/.test(cleaned)) return "file";
  if (cleaned.length <= maxFilenameLength) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 ? cleaned.slice(dot).slice(0, 16) : "";
  return cleaned.slice(0, maxFilenameLength - extension.length) + extension;
}

/** `name.png` → `name-2.png` when `name.png` is taken, so every attachment can be referenced unambiguously. */
export function uniqueFilename(name: string, taken: readonly string[]): string {
  if (!taken.includes(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${extension}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/** The filename an `attachment://` link points at, or null for any other link. */
export function attachmentName(url: string): string | null {
  const value = url.trim();
  return attachmentReference.test(value)
    ? value.slice("attachment://".length)
    : null;
}

/** A size for people: kilobytes below a megabyte, so a small file never reads as 0 MB. */
export const megabytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toLocaleString("en-GB", { maximumFractionDigits: 1 })} MB`;

/** Why a file can't be added, or null; the server enforces the same limits. */
export function uploadProblem(
  file: { name: string; size: number },
  attached: readonly { size: number }[],
  maxFileBytes: number,
): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > maxFileBytes)
    return `${file.name} is ${megabytes(file.size)}; each file can be at most ${megabytes(maxFileBytes)}.`;
  if (attached.length >= uploadLimits.attachmentsPerMessage)
    return `A message holds at most ${uploadLimits.attachmentsPerMessage} files.`;
  const total = attached.reduce((sum, item) => sum + item.size, 0) + file.size;
  if (total > uploadLimits.messageBytes)
    return `Adding ${file.name} would pass the ${megabytes(uploadLimits.messageBytes)} limit for one message.`;
  return null;
}

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
 * An uploaded file is referenced as `attachment://filename`; Discord only
 * matches filenames made of ASCII letters, digits, dots, dashes and underscores.
 */
const attachmentReference = /^attachment:\/\/(?!\.+$)[\w.-]+$/;

/**
 * Whether Discord would accept the link; empty counts as acceptable, since every link is optional.
 * Title and author links open in a browser, so they must be web links; images
 * and icons may also point at a file uploaded with the message.
 */
export function isAcceptedLink(url: string, media: boolean): boolean {
  return linkProblem(url, media) === null;
}

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
  if (protocol === "attachment:" && media)
    return attachmentReference.test(value)
      ? null
      : "Name an uploaded file as attachment://filename, using only letters, digits, dots, dashes and underscores.";
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
    const name = media ? attachmentName(url) : null;
    if (name !== null && !message.attachments.some((a) => a.filename === name))
      add(
        path,
        label,
        `No attached file is named ${name}. Upload it, or choose one of the uploaded images.`,
      );
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

  const files = message.attachments;
  if (files.length > uploadLimits.attachmentsPerMessage)
    add(
      "attachments",
      "Files",
      `A message holds at most ${uploadLimits.attachmentsPerMessage} files; remove ${files.length - uploadLimits.attachmentsPerMessage}.`,
    );
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (bytes > uploadLimits.messageBytes)
    add(
      "attachments",
      "Files",
      `The files total ${megabytes(bytes)}; Discord's limit for one message is ${megabytes(uploadLimits.messageBytes)}.`,
    );
  files.forEach((file, i) => {
    if (files.findIndex((other) => other.filename === file.filename) !== i)
      add(
        `attachments.${i}`,
        `File ${i + 1}`,
        `Another file is also named ${file.filename}; rename or remove one.`,
      );
  });

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
