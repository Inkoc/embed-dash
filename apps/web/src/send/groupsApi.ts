import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { channelGroupSchema, type ChannelGroup } from "@embed-dash/shared";
import { connectionFailure, failureFrom, type Action } from "../errors";
import type { Session } from "../shell/SessionGate";

const listSchema = channelGroupSchema.array();
const listKey = ["channel-groups"];

const csrf = (client: QueryClient) =>
  client.getQueryData<Session>(["session"])?.csrfToken ?? "";

async function call(
  action: Action,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw connectionFailure(action);
  }
  if (response.ok) return response;
  throw await failureFrom(action, response);
}

const json = (client: QueryClient, method: string, body: object) => ({
  method,
  headers: {
    "content-type": "application/json",
    "x-csrf-token": csrf(client),
  },
  body: JSON.stringify(body),
});

/** The list is ordered by name, as the server returns it. */
const put = (client: QueryClient, group: ChannelGroup) =>
  client.setQueryData<ChannelGroup[]>(listKey, (list) =>
    [...(list ?? []).filter((item) => item.id !== group.id), group].sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    ),
  );

export function useChannelGroups() {
  return useQuery({
    queryKey: listKey,
    retry: false,
    queryFn: async () => {
      const response = await call("load-groups", "/api/channel-groups", {});
      return listSchema.parse(await response.json());
    },
  });
}

export function useSaveGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; channelIds: string[] }) => {
      const response = await call(
        "save-group",
        "/api/channel-groups",
        json(client, "POST", input),
      );
      return channelGroupSchema.parse(await response.json());
    },
    onSuccess: (group) => put(client, group),
  });
}

export function useUpdateGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...change
    }: {
      id: string;
      name?: string;
      channelIds?: string[];
    }) => {
      const response = await call(
        "change-group",
        `/api/channel-groups/${id}`,
        json(client, "PATCH", change),
      );
      return channelGroupSchema.parse(await response.json());
    },
    onSuccess: (group) => put(client, group),
  });
}

export function useDeleteGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await call("delete-group", `/api/channel-groups/${id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrf(client) },
      });
      return id;
    },
    onSuccess: (id) =>
      client.setQueryData<ChannelGroup[]>(listKey, (list) =>
        (list ?? []).filter((item) => item.id !== id),
      ),
  });
}
