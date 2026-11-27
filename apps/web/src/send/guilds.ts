import { useQuery, useQueryClient } from "@tanstack/react-query";
import { guildsResponseSchema } from "@embed-dash/shared";

export const guildsErrorMessage =
  "Unable to list the bot's servers. Check the connection to Discord, then retry.";

async function loadGuilds(refresh: boolean) {
  const response = await fetch(
    refresh ? "/api/guilds?refresh=1" : "/api/guilds",
  );
  if (!response.ok) {
    // The server sends a fixed, safe message for each kind of Discord failure.
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    throw new Error(
      typeof body?.error === "string" ? body.error : guildsErrorMessage,
    );
  }
  return guildsResponseSchema.parse(await response.json());
}

/** The bot's servers and channels; the server caches them for a minute, Refresh skips that. */
export function useGuilds() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["guilds"],
    retry: false,
    staleTime: 60_000,
    queryFn: () => loadGuilds(false),
  });
  const refresh = () =>
    client
      .fetchQuery({
        queryKey: ["guilds"],
        staleTime: 0,
        queryFn: () => loadGuilds(true),
      })
      // The query keeps the error for the view to show.
      .catch(() => undefined);
  return { ...query, refresh };
}
