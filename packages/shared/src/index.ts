import { z } from "zod";
export const botIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.url().nullable(),
});
export type BotIdentity = z.infer<typeof botIdentitySchema>;
