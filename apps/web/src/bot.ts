import { useQuery } from "@tanstack/react-query";
import { botIdentitySchema, type BotIdentity } from "@embed-dash/shared";
import { connectionFailure, failureFrom, type AppError } from "./errors";

/** A few words for the top bar, which has no room for the whole reason. */
const shortReasons: Record<string, string> = {
  DISCORD_INVALID_TOKEN: "token refused",
  DISCORD_UNREACHABLE: "Discord unreachable",
  DISCORD_UNAVAILABLE: "Discord unavailable",
  DISCORD_RATE_LIMITED: "rate limited",
};

export const botShortReason = (error: AppError) =>
  (error.code && shortReasons[error.code]) || null;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * The first character a person sees in the name, for the avatar fallback. An
 * emoji or accented letter spans several code units (a flag or family emoji
 * several code points), so slicing the string would show half a glyph.
 */
export function botInitial(name: string): string {
  const first = graphemes.segment(name.trim())[Symbol.iterator]().next();
  return first.done ? "?" : first.value.segment.toUpperCase();
}

/** The connected bot's identity; one query shared by every view that shows it. */
export function useBot() {
  return useQuery<BotIdentity, AppError>({
    queryKey: ["bot"],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetch("/api/bot").catch(() => {
        throw connectionFailure("connect-bot");
      });
      if (!response.ok) throw await failureFrom("connect-bot", response);
      return botIdentitySchema.parse(await response.json());
    },
  });
}
