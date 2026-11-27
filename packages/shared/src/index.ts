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
