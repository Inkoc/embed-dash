import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { guildsResponseSchema } from "@embed-dash/shared";
import { connectionFailure, failureFrom } from "../errors";

async function loadGuilds(refresh: boolean) {
  let response: Response;
  try {
    response = await fetch(refresh ? "/api/guilds?refresh=1" : "/api/guilds");
  } catch {
    throw connectionFailure("load-servers");
  }
  if (!response.ok) throw await failureFrom("load-servers", response);
  return guildsResponseSchema.parse(await response.json());
}

export const refreshGuilds = (client: QueryClient) =>
  client
    .fetchQuery({
      queryKey: ["guilds"],
      staleTime: 0,
      queryFn: () => loadGuilds(true),
    })
    // The query keeps the error for the view to show.
    .catch(() => undefined);

/** The bot's servers and channels; the server caches them for a minute, Refresh skips that. */
export function useGuilds(enabled = true) {
  const client = useQueryClient();
  const query = useQuery({
    enabled,
    queryKey: ["guilds"],
    retry: false,
    staleTime: 60_000,
    queryFn: () => loadGuilds(false),
  });
  const refresh = () => refreshGuilds(client);
  return { ...query, refresh };
}
