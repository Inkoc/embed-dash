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
  /** Title, description, field names and values, footer text and author name together. */
  embedTotal: 6000,
} as const;

export interface EmbedTextParts {
  title?: string;
  description?: string;
  fields?: readonly { name: string; value: string }[];
  footer?: { text: string };
  author?: { name: string };
}

/** Discord counts Unicode characters, so an emoji is one character, not two UTF-16 units. */
export function textLength(text: string): number {
  return [...text].length;
}

/** Characters that count towards Discord's 6,000-character limit for one embed. */
export function embedTextLength(embed: EmbedTextParts): number {
  const parts = [
    embed.title,
    embed.description,
    embed.footer?.text,
    embed.author?.name,
    ...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
  ];
  return parts.reduce((total, part) => total + textLength(part ?? ""), 0);
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
