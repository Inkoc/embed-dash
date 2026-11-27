import { z } from "zod";
import {
  emptyEmbed,
  messageDraftSchema,
  validateMessage,
  type MessageDraft,
} from "./index.js";

const media = z.object({ url: z.string() });
const externalEmbed = z.object({
  title: z.string().nullish(),
  description: z.string().nullish(),
  url: z.string().nullish(),
  color: z.number().int().min(0).max(0xffffff).nullish(),
  timestamp: z.iso.datetime({ offset: true }).nullish(),
  author: z
    .object({
      name: z.string(),
      url: z.string().nullish(),
      icon_url: z.string().nullish(),
    })
    .nullish(),
  footer: z
    .object({ text: z.string(), icon_url: z.string().nullish() })
    .nullish(),
  fields: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        inline: z.boolean().nullish(),
      }),
    )
    .nullish(),
  image: media.nullish(),
  thumbnail: media.nullish(),
});
const externalMessage = z.object({
  content: z.string().nullish(),
  embeds: z.array(externalEmbed).nullish(),
});
const wrapper = z.object({
  messages: z.array(z.unknown()).min(1),
});

export type JsonImportResult =
  | { ok: true; message: MessageDraft; notices: string[] }
  | { ok: false; error: string };

// Walk the accepted shape so unknown nested properties are reported as well as top-level ones.
function unsupported(raw: unknown, accepted: unknown, path = ""): string[] {
  if (Array.isArray(raw) && Array.isArray(accepted))
    return accepted.flatMap((value, i) =>
      unsupported(raw[i], value, `${path}[${i}]`),
    );
  if (
    !raw ||
    typeof raw !== "object" ||
    !accepted ||
    typeof accepted !== "object"
  )
    return [];
  const known = accepted as Record<string, unknown>;
  return Object.entries(raw).flatMap(([key, value]) => {
    const at = path ? `${path}.${key}` : key;
    if (value === null || (Array.isArray(value) && value.length === 0))
      return [];
    return Object.hasOwn(known, key)
      ? unsupported(value, known[key], at)
      : [`Unsupported field: ${at}.`];
  });
}

function schemaError(issue: z.core.$ZodIssue): string {
  const path = issue.path.filter(
    (part) => part !== "messages" && part !== "data",
  );
  if (issue.path[0] === "messages" && path[0] === 0) path.shift();
  const labels: Record<string, string> = {
    content: "message text",
    embeds: "embeds",
    title: "title",
    description: "description",
    color: "side colour",
    timestamp: "time",
    url: "link",
    author: "author",
    footer: "footer",
    name: "name",
    text: "text",
    icon_url: "icon link",
    image: "image",
    thumbnail: "thumbnail",
    fields: "fields",
    value: "value",
    inline: "inline setting",
  };
  let label = "";
  if (path[0] === "embeds" && typeof path[1] === "number") {
    label = `Embed ${path[1] + 1}`;
    path.splice(0, 2);
  }
  if (path[0] === "fields" && typeof path[1] === "number") {
    label += ` field ${path[1] + 1}`;
    path.splice(0, 2);
  }
  label = [label, ...path.map((part) => labels[String(part)] ?? "property")]
    .filter(Boolean)
    .join(" ");
  if (!label)
    label = issue.path.includes("data")
      ? "First message data"
      : issue.path.includes("messages")
        ? "Message list"
        : "Message";
  label = label[0]!.toUpperCase() + label.slice(1);
  if (issue.path.at(-1) === "color")
    return `${label} must be a whole number from 0 to 16777215, or null for the default colour.`;
  if (issue.code === "invalid_type") {
    const types: Record<string, string> = {
      string: "text",
      array: "a list",
      object: "an object",
      boolean: "true or false",
      number: "a number",
    };
    return `${label} must be ${types[issue.expected] ?? "a valid value"}.`;
  }
  if (issue.code === "invalid_format")
    return `${label} must be an ISO 8601 date and time, such as 2026-11-27T18:00:00Z.`;
  return `${label} must contain at least one message.`;
}

function limitedNotices(notices: string[]): string[] {
  const unique = [...new Set(notices)];
  return unique.length > 20
    ? [
        ...unique.slice(0, 20),
        `And ${unique.length - 20} more unsupported fields.`,
      ]
    : unique;
}

/** Accepts portable message JSON without trusting instance-specific fields. */
export function importMessageJson(text: string): JsonImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "Invalid JSON. Check quotes, commas and brackets.",
    };
  }
  const wrapped = raw !== null && typeof raw === "object" && "messages" in raw;
  const parsed = wrapped
    ? wrapper.safeParse(raw)
    : externalMessage.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return {
      ok: false,
      error: schemaError(issue),
    };
  }
  const first =
    "messages" in parsed.data
      ? z.object({ data: externalMessage }).safeParse(parsed.data.messages[0])
      : null;
  if (first && !first.success) {
    const issue = first.error.issues[0]!;
    return {
      ok: false,
      error: schemaError(issue),
    };
  }
  const data = first?.success
    ? first.data.data
    : externalMessage.parse(parsed.data);
  const notices = wrapped
    ? unsupported(raw, { messages: [{ data }] })
    : unsupported(raw, data);
  if ("messages" in parsed.data && parsed.data.messages.length > 1)
    notices.push(
      `Imported the first of ${parsed.data.messages.length} messages. Remaining messages were not loaded.`,
    );
  const message = messageDraftSchema.parse({
    content: data.content ?? "",
    attachments: [],
    embeds: (data.embeds ?? []).map((embed) => ({
      ...emptyEmbed(),
      color:
        embed.color == null
          ? emptyEmbed().color
          : `#${embed.color.toString(16).padStart(6, "0")}`,
      title: embed.title ?? "",
      description: embed.description ?? "",
      url: embed.url ?? "",
      timestamp: embed.timestamp ?? "",
      author: {
        name: embed.author?.name ?? "",
        url: embed.author?.url ?? "",
        iconUrl: embed.author?.icon_url ?? "",
      },
      footer: {
        text: embed.footer?.text ?? "",
        iconUrl: embed.footer?.icon_url ?? "",
      },
      fields: (embed.fields ?? []).map((field) => ({
        ...field,
        inline: field.inline ?? false,
      })),
      image: embed.image?.url ?? "",
      thumbnail: embed.thumbnail?.url ?? "",
    })),
  });
  const issues = validateMessage(message);
  if (issues.length)
    return {
      ok: false,
      error: issues
        .map((issue) => `${issue.label}: ${issue.message}`)
        .join("\n"),
    };
  return { ok: true, message, notices: limitedNotices(notices) };
}

/** An explicit allowlist prevents editor ids and upload metadata from reaching an export. */
export function exportMessageJson(
  message: MessageDraft,
  now: Date,
): { json: string; notices: string[] } {
  const notices: string[] = [];
  if (message.attachments.length)
    notices.push(
      "Uploaded files are omitted. Upload them again on the destination instance.",
    );
  const portableMedia = (url: string, path: string) => {
    if (!url.trim()) return undefined;
    if (
      url.trim().startsWith("attachment://") ||
      /^\/?api\/uploads\//.test(url.trim())
    ) {
      notices.push(
        `${path} was omitted because it refers to an uploaded file.`,
      );
      return undefined;
    }
    return url;
  };
  const embeds = message.embeds.map((embed, i) => {
    const image = portableMedia(embed.image, `Embed ${i + 1} image`);
    const thumbnail = portableMedia(
      embed.thumbnail,
      `Embed ${i + 1} thumbnail`,
    );
    const authorIcon = portableMedia(
      embed.author.iconUrl,
      `Embed ${i + 1} author icon`,
    );
    const footerIcon = portableMedia(
      embed.footer.iconUrl,
      `Embed ${i + 1} footer icon`,
    );
    if (embed.timestamp === "now")
      notices.push(
        `Embed ${i + 1} time of sending was resolved to the export time.`,
      );
    const validColor = /^#[0-9a-f]{6}$/i.test(embed.color);
    if (!validColor)
      notices.push(
        `Embed ${i + 1} side colour was omitted because it is not a six-digit hex colour.`,
      );
    return {
      ...(embed.title && { title: embed.title }),
      ...(embed.description && { description: embed.description }),
      ...(embed.url && { url: embed.url }),
      ...(validColor && { color: Number.parseInt(embed.color.slice(1), 16) }),
      ...(embed.timestamp && {
        timestamp:
          embed.timestamp === "now" ? now.toISOString() : embed.timestamp,
      }),
      ...(embed.author.name && {
        author: {
          name: embed.author.name,
          ...(embed.author.url && { url: embed.author.url }),
          ...(authorIcon && { icon_url: authorIcon }),
        },
      }),
      ...(embed.footer.text && {
        footer: {
          text: embed.footer.text,
          ...(footerIcon && { icon_url: footerIcon }),
        },
      }),
      ...(embed.fields.length > 0 && {
        fields: embed.fields.map(({ name, value, inline }) => ({
          name,
          value,
          inline,
        })),
      }),
      ...(image && { image: { url: image } }),
      ...(thumbnail && { thumbnail: { url: thumbnail } }),
    };
  });
  return {
    json: JSON.stringify({ content: message.content, embeds }, null, 2),
    notices,
  };
}
