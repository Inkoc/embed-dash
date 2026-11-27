import { useQuery } from "@tanstack/react-query";
import { botIdentitySchema } from "@embed-dash/shared";

export const botErrorMessage =
  "Unable to connect to Discord. Check the bot token and connection, then retry.";

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
  return useQuery({
    queryKey: ["bot"],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetch("/api/bot");
      if (!response.ok) throw new Error(botErrorMessage);
      return botIdentitySchema.parse(await response.json());
    },
  });
}
