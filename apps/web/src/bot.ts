import { useQuery } from "@tanstack/react-query";
import { botIdentitySchema } from "@embed-dash/shared";

export const botErrorMessage =
  "Unable to connect to Discord. Check the bot token and connection, then retry.";

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
