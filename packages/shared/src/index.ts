import { z } from "zod";
export const botIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.url().nullable(),
});
export type BotIdentity = z.infer<typeof botIdentitySchema>;

/** Discord snowflake IDs are 17 to 20 digits for every account created so far. */
export const snowflakeSchema = z.string().regex(/^\d{17,20}$/);

/** The signed-in person shown in the app after Discord login. */
export const sessionUserSchema = z.object({
  id: snowflakeSchema,
  name: z.string().min(1).max(100),
  avatarUrl: z.url().nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

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
export const forumLimits = { title: 100, tags: 5 } as const;
export const messageDraftSchema = z.object({
  forumTitle: z.string().max(forumLimits.title).optional(),
  forumTags: z
    .record(
      z.string(),
      z
        .array(snowflakeSchema)
        .max(forumLimits.tags)
        .refine((ids) => new Set(ids).size === ids.length),
    )
    .optional(),

  content: z.string(),
  embeds: z.array(embedDraftSchema),
  attachments: z.array(attachmentSchema).default([]),
});
export type AttachmentDraft = z.infer<typeof attachmentSchema>;
export type EmbedFieldDraft = z.infer<typeof embedFieldSchema>;
export type EmbedDraft = z.infer<typeof embedDraftSchema>;
export type MessageDraft = z.infer<typeof messageDraftSchema>;

/** A saved message to start new ones from. Its message is a draft: it may still break a Discord limit. */
export const templateNameMax = 100;
export const templateNameSchema = z.string().trim().min(1).max(templateNameMax);
export const templateInputSchema = z.object({
  name: templateNameSchema,
  message: messageDraftSchema,
});
/** Rename, overwrite the message, or both. */
export const templateUpdateSchema = z
  .object({
    name: templateNameSchema.optional(),
    message: messageDraftSchema.optional(),
  })
  .refine(
    (update) => update.name !== undefined || update.message !== undefined,
  );
export const templateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  updatedAt: z.iso.datetime(),
  message: messageDraftSchema,
  /** Ids of the template's files the server no longer has. */
  missingFiles: z.array(z.string()),
});
export type Template = z.infer<typeof templateSchema>;

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

/**
 * `name.png` → `name-2.png` when `name.png` is taken, so every attachment can be referenced unambiguously.
 * The stem gives way to the suffix so the result stays within the length the
 * server keeps; otherwise shortening it there could make two names equal again.
 */
export function uniqueFilename(name: string, taken: readonly string[]): string {
  if (!taken.includes(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const room = Math.max(
      1,
      maxFilenameLength - extension.length - suffix.length,
    );
    const candidate = `${stem.slice(0, room)}${suffix}${extension}`;
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

/** Whether an embed has anything Discord would show; an empty one is never sent. */
export function embedHasContent(embed: EmbedDraft) {
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

/**
 * Every reason Discord would reject the message, in the order the form shows the parts.
 * `missingFiles` holds the ids of attachments the server no longer has; the
 * browser learns of them from the server, which finds them again at send time.
 */
export function validateMessage(
  message: MessageDraft,
  {
    missingFiles = new Set<string>(),
  }: { missingFiles?: ReadonlySet<string> } = {},
): Issue[] {
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
    if (name === null) return;
    const file = message.attachments.find((a) => a.filename === name);
    if (!file)
      add(
        path,
        label,
        `No attached file is named ${name}. Upload it, or choose one of the uploaded images.`,
      );
    else if (missingFiles.has(file.id))
      add(
        path,
        label,
        `${name} is no longer on the server. Remove it under Files, upload it again and choose it here.`,
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
    if (missingFiles.has(file.id))
      add(
        `attachments.${i}`,
        `File ${i + 1}`,
        `${file.filename} is no longer on the server. Remove it and upload the file again.`,
      );
    if (files.findIndex((other) => other.filename === file.filename) !== i)
      add(
        `attachments.${i}`,
        `File ${i + 1}`,
        `Another file is also named ${file.filename}. Remove this ${megabytes(file.size)} one and upload it again; it is given a new name.`,
      );
  });

  message.embeds.forEach((embed, e) => {
    const at = `embeds.${e}`;
    const name = `Embed ${e + 1}`;
    if (!embedHasContent(embed)) {
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

/**
 * The permissions the bot needs in a channel, in the order a missing one is
 * reported: without View Channel the others don't matter. Attach Files only
 * matters for messages with uploads, so it never blocks posting on its own.
 */
export const channelPermissions = [
  { key: "viewChannel", label: "View Channel", bit: 1n << 10n, required: true },
  {
    key: "sendMessages",
    label: "Send Messages",
    bit: 1n << 11n,
    required: true,
  },
  { key: "embedLinks", label: "Embed Links", bit: 1n << 14n, required: true },
  {
    key: "attachFiles",
    label: "Attach Files",
    bit: 1n << 15n,
    required: false,
  },
  {
    key: "createPublicThreads",
    label: "Create Public Threads",
    bit: 1n << 35n,
    required: true,
  },
  {
    key: "sendMessagesInThreads",
    label: "Send Messages in Threads",
    bit: 1n << 38n,
    required: true,
  },
] as const;
export type ChannelPermission = (typeof channelPermissions)[number]["key"];

/** Adds the bot to a server with exactly the permissions it checks for. */
export function inviteUrl(clientId: string): string {
  const permissions = channelPermissions.reduce((all, p) => all | p.bit, 0n);
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&scope=bot&permissions=${permissions}`;
}

export const channelKindSchema = z.enum(["text", "announcement", "forum"]);
export type ChannelKind = z.infer<typeof channelKindSchema>;

export const guildChannelSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: channelKindSchema,
  availableTags: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .optional(),
  requireTag: z.boolean().optional(),
  /** Permissions the bot lacks here, in `channelPermissions` order. */
  missing: z.array(
    z.enum(channelPermissions.map((p) => p.key) as [ChannelPermission]),
  ),
});
export type GuildChannel = z.infer<typeof guildChannelSchema>;

export const guildSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  iconUrl: z.url().nullable(),
  /** Channels in Discord's sidebar order: uncategorised first, then by category. */
  channels: z.array(guildChannelSchema),
  /** The channel "main channel of each server" picks, if the bot can post anywhere. */
  mainChannelId: z.string().nullable(),
});
export type Guild = z.infer<typeof guildSchema>;

export const guildsResponseSchema = z.object({
  guilds: z.array(guildSchema),
  /** Servers the bot is listed in but couldn't read (removed or lost access mid-listing). */
  unavailable: z.array(z.object({ id: z.string(), name: z.string() })),
  fetchedAt: z.iso.datetime(),
});
export type GuildsResponse = z.infer<typeof guildsResponseSchema>;

export function canPost(channel: Pick<GuildChannel, "missing">): boolean {
  return !channel.missing.some(
    (key) => channelPermissions.find((p) => p.key === key)?.required,
  );
}

/** Forum creation uses the same delivery eligibility as other destinations. */
export function canSendTo(
  channel: Pick<GuildChannel, "missing" | "kind">,
): boolean {
  return canPost(channel);
}

/**
 * The server's system channel if the bot can post there, else its first
 * postable announcement channel, else its first postable text channel.
 */
export function mainChannelId(
  channels: readonly GuildChannel[],
  systemChannelId: string | null,
): string | null {
  const postable = channels.filter(canPost);
  return (
    (
      postable.find((c) => c.id === systemChannelId && c.kind !== "forum") ??
      postable.find((c) => c.kind === "announcement") ??
      postable.find((c) => c.kind === "text") ??
      null
    )?.id ?? null
  );
}

/** Who a message may notify; none by default, so a pasted mention never pings. */
export const pingKinds = ["users", "roles", "everyone"] as const;
export type PingKind = (typeof pingKinds)[number];

/** What is sent: the composed message plus how it is delivered. */
export const messagePayloadSchema = messageDraftSchema.extend({
  pings: z
    .array(z.enum(pingKinds))
    .refine((kinds) => new Set(kinds).size === kinds.length)
    .default([]),
  /** Delivered without a push or desktop notification. */
  silent: z.boolean().default(false),
  publish: z.boolean().optional(),
});
export type MessagePayload = z.infer<typeof messagePayloadSchema>;

/** One-off plans are bounded so uploads cannot be held indefinitely. */
export const scheduleHorizonMs = 365 * 24 * 60 * 60 * 1000;
export const scheduledAtSchema = z.iso
  .datetime({ offset: true })
  .refine(
    (value) => Date.parse(value) <= Date.now() + scheduleHorizonMs,
    "Choose a time within the next year.",
  );

export const sendRequestSchema = z.object({
  scheduledAt: scheduledAtSchema.optional(),
  /** Chosen by the browser, so repeating a request that may have been lost can't post twice. */
  id: z.uuid(),
  payload: messagePayloadSchema,
  channelIds: z
    .array(z.string().min(1))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const scheduleEditSchema = sendRequestSchema
  .omit({ id: true })
  .required({ scheduledAt: true })
  .strict();
export const sendIdSchema = z.object({ id: z.uuid() });
export type SendRequest = z.infer<typeof sendRequestSchema>;

export const editRequestSchema = z
  .object({ id: z.uuid(), payload: messagePayloadSchema })
  .strict();

export const retryRequestSchema = z.object({
  /** Only these failed copies; omitted, every failed copy. */
  targetIds: z.array(z.string()).min(1).optional(),
});

/** Why a copy did not arrive, in words for the operator. */
export const deliveryErrors = {
  UPLOAD_MISSING:
    "A file needed for this message is missing from the server. Compose it again with the file restored or removed.",
  EDIT_UNCONFIRMED:
    "Discord may not have applied this update. Retry to apply the current version safely.",
  EDIT_NOT_ATTEMPTED:
    "This copy was not updated. Retry to apply the current version.",
  MESSAGE_DELETED: "Deleted in Discord. This copy can no longer be updated.",
  MISSING_PERMISSION:
    "The bot isn’t allowed to post in this channel. Give it View Channel, Send Messages and Embed Links there, then retry.",
  CHANNEL_GONE:
    "This channel no longer exists, or the bot can no longer see it. Refresh the channel list and pick another.",
  INVALID_PAYLOAD:
    "Discord rejected the message itself, for example a link it can’t use or a file that is too large. Nothing was posted here.",
  RATE_LIMITED:
    "Discord’s rate limit held this channel up for too long. Nothing was posted here; wait a minute, then retry.",
  DISCORD_UNAVAILABLE:
    "Discord had a problem on its side. Nothing was posted here; retry shortly.",
  UNREACHABLE:
    "The app couldn’t reach Discord. Nothing was posted here; check the connection, then retry.",
  UNKNOWN_OUTCOME:
    "Discord didn’t answer in time, so the message may have been posted. Open the channel and look before sending again.",
  INVALID_TOKEN:
    "Discord rejected the bot token, so the send stopped here. Fix the configured token and restart the app, then retry.",
  NOT_ATTEMPTED:
    "Not sent: the send stopped before reaching this channel. Retry once the cause is fixed.",
  FORUM_CHANNEL: "Forum posting isn’t available yet.",
  SERVER_REFUSING:
    "Not sent: the bot was refused in several channels of this server in a row, so the rest were skipped. Check the bot’s access to the server, then retry.",
} as const;
export type DeliveryErrorCode = keyof typeof deliveryErrors;
export const deliveryErrorCodes = Object.keys(deliveryErrors) as [
  DeliveryErrorCode,
  ...DeliveryErrorCode[],
];

const deliveryErrorSchema = z.object({
  code: z.enum(deliveryErrorCodes),
  message: z.string(),
});

export const sendTargetSchema = z.object({
  sendId: z.string().optional(),
  id: z.string(),
  guildId: z.string(),
  guildName: z.string(),
  channelId: z.string(),
  channelName: z.string(),
  channelKind: channelKindSchema.optional(),
  publishStatus: z
    .enum(["pending", "publishing", "published", "failed"])
    .nullable()
    .optional(),
  publishError: z.string().nullable().optional(),
  status: z.enum(["pending", "posting", "sent", "failed", "unknown"]),
  messageId: z.string().nullable(),
  error: deliveryErrorSchema.nullable(),
});
export type SendTarget = z.infer<typeof sendTargetSchema>;

export const sendResultSchema = z.object({
  scheduledAt: z.number().nullable().optional(),
  id: z.string(),
  editId: z.string().nullable().optional(),
  edit: z
    .object({
      id: z.string(),
      status: z.enum(["sending", "done"]),
      targets: z.array(sendTargetSchema),
    })
    .nullable()
    .optional(),
  lastEditedAt: z.number().nullable().optional(),
  status: z.enum([
    "scheduled",
    "cancelled",
    "sending",
    "done",
    "partial",
    "failed",
  ]),
  targets: z.array(sendTargetSchema),
});
export type SendResult = z.infer<typeof sendResultSchema>;

/** Channels a send was refused for, with nothing sent anywhere. */
export const channelsUnavailableSchema = z.object({
  code: z.literal("CHANNELS_UNAVAILABLE"),
  error: z.string(),
  channels: z.array(
    z.object({
      id: z.string(),
      reason: z.enum(["gone", "permission", "forum"]),
    }),
  ),
});

/**
 * A named set of channels to tick again in one step. Each channel keeps the
 * names it had when saved, so one that has since gone can still be named.
 */
export const channelGroupNameMax = 100;
/** Bounds that keep the picker's group row and each group readable. */
export const channelGroupLimits = { groups: 50, channels: 500 } as const;
/** Two group names that only differ in case or surrounding spaces are the same name. */
export const channelGroupNameKey = (name: string) =>
  name.trim().toLocaleLowerCase();
export const channelGroupNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(channelGroupNameMax);
const groupChannelIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(channelGroupLimits.channels)
  .refine((ids) => new Set(ids).size === ids.length);
export const channelGroupInputSchema = z.object({
  name: channelGroupNameSchema,
  channelIds: groupChannelIdsSchema,
});
/** Rename, replace the channels, or both. */
export const channelGroupUpdateSchema = z
  .object({
    name: channelGroupNameSchema.optional(),
    channelIds: groupChannelIdsSchema.optional(),
  })
  .refine(
    (update) => update.name !== undefined || update.channelIds !== undefined,
  );
export const channelGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  updatedAt: z.iso.datetime(),
  channels: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      guildId: z.string(),
      guildName: z.string(),
    }),
  ),
});
export type ChannelGroup = z.infer<typeof channelGroupSchema>;

/** Where a sent message can be opened in Discord. */
export const messageLink = (target: {
  guildId: string;
  channelId: string;
  messageId: string;
}) =>
  `https://discord.com/channels/${target.guildId}/${target.channelId}/${target.messageId}`;

/** History bounds are exact instants; the upper bound is exclusive. */
export const historyQuerySchema = z
  .object({
    q: z.string().trim().max(500).default(""),
    guildId: z.string().min(1).max(100).optional(),
    channelId: z.string().min(1).max(100).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    status: z
      .enum(["scheduled", "cancelled", "sending", "done", "partial", "failed"])
      .optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine(
    (query) =>
      !query.from ||
      !query.to ||
      Date.parse(query.from) <= Date.parse(query.to),
    {
      message: "The start date must be on or before the end date.",
      path: ["to"],
    },
  );
export const historyFiltersSchema = z
  .object({
    ...historyQuerySchema.shape,
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "The start date must be on or before the end date.",
    path: ["to"],
  });
export const historyEntrySchema = z.object({
  scheduledAt: z.number().nullable().optional(),
  id: z.string(),
  title: z.string(),
  color: z.string(),
  createdAt: z.number(),
  channelCount: z.number(),
  lastEditedAt: z.number().nullable().default(null),
  destinations: z
    .array(
      z.object({
        guildId: z.string(),
        guildName: z.string(),
        channelId: z.string(),
        channelName: z.string(),
      }),
    )
    .default([]),
  unconfirmed: z.boolean().default(false),
  updateFailureCount: z.number().int().nonnegative().default(0),
  status: sendResultSchema.shape.status,
});
export const historyResponseSchema = z.object({
  entries: z.array(historyEntrySchema),
  hasMore: z.boolean(),
  destinations: z.array(
    z.object({
      guildId: z.string(),
      guildName: z.string(),
      channelId: z.string(),
      channelName: z.string(),
    }),
  ),
});
export const historyDetailSchema = sendResultSchema.extend({
  retainedUploads: z.array(z.string()).optional(),
  payload: messagePayloadSchema,
  createdAt: z.number(),
});
export type HistoryDetail = z.infer<typeof historyDetailSchema>;

export {
  importMessageJson,
  exportMessageJson,
  type JsonImportResult,
} from "./messageJson.js";

export type HistoryDestination = z.infer<
  typeof historyEntrySchema
>["destinations"][number];

/** What a later search will look in: every text a reader sees. */
export function searchText(payload: MessagePayload): string {
  return [
    payload.content,
    ...payload.embeds.flatMap((embed) => [
      embed.title,
      embed.description,
      embed.author.name,
      embed.footer.text,
      ...embed.fields.flatMap((field) => [field.name, field.value]),
    ]),
  ]
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

/** Prefer an embed heading, then the first visible message or description line. */
export function messageTitle(payload: MessagePayload): string {
  const line = (text: string) => text.split("\n").find((part) => part.trim());
  return (
    payload.embeds.find((embed) => embed.title.trim())?.title ||
    line(payload.content) ||
    payload.embeds.map((embed) => line(embed.description)).find(Boolean) ||
    "Untitled message"
  );
}

/** Destination-specific checks also run when a schedule is delivered. */
export function destinationProblem(
  payload: MessagePayload,
  channel: GuildChannel,
): string | null {
  if (channel.kind !== "forum") return null;
  if (!payload.forumTitle?.trim())
    return "Enter a post title for forum destinations.";
  const tags = payload.forumTags?.[channel.id] ?? [];
  if (channel.requireTag && !tags.length)
    return `Choose a tag for #${channel.name}.`;
  if (tags.some((id) => !channel.availableTags?.some((tag) => tag.id === id)))
    return `Choose available tags for #${channel.name}.`;
  return null;
}
