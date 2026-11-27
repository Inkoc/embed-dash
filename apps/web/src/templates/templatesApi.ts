import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  templateSchema,
  type MessageDraft,
  type Template,
} from "@embed-dash/shared";
import type { Session } from "../shell/SessionGate";

const listSchema = templateSchema.array();
const listKey = ["templates"];

const csrf = (client: QueryClient) =>
  client.getQueryData<Session>(["session"])?.csrfToken ?? "";

/** The server's catch-all answer, which says nothing a person can act on. */
const genericError = "Request failed";

async function call(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("Unable to connect. Check your connection and try again.");
  }
  if (response.ok) return response;
  if (response.status === 401)
    throw new Error("Your session ended. Refresh the page and sign in again.");
  if (response.status === 403)
    throw new Error("Your session changed. Refresh the page and try again.");
  const { error } = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  throw new Error(error && error !== genericError ? error : fallback);
}

export function useTemplates() {
  return useQuery({
    queryKey: listKey,
    retry: false,
    queryFn: async () => {
      const response = await call(
        "/api/templates",
        {},
        "The server couldn’t read the saved templates. Check that embed-dash is running and its data folder is reachable, then try again.",
      );
      return listSchema.parse(await response.json());
    },
  });
}

/** Puts a changed template first, as the list orders them by last update. */
const putFirst = (client: QueryClient, template: Template) =>
  client.setQueryData<Template[]>(listKey, (list) => [
    template,
    ...(list ?? []).filter((item) => item.id !== template.id),
  ]);

export function useSaveTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; message: MessageDraft }) => {
      const response = await call(
        "/api/templates",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf(client),
          },
          body: JSON.stringify(input),
        },
        "The template couldn’t be saved. Try again.",
      );
      return templateSchema.parse(await response.json());
    },
    onSuccess: (template) => putFirst(client, template),
  });
}

export function useUpdateTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...change
    }: {
      id: string;
      name?: string;
      message?: MessageDraft;
    }) => {
      const response = await call(
        `/api/templates/${id}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf(client),
          },
          body: JSON.stringify(change),
        },
        "The template couldn’t be changed. Try again.",
      );
      return templateSchema.parse(await response.json());
    },
    onSuccess: (template) => putFirst(client, template),
  });
}

export function useDeleteTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await call(
        `/api/templates/${id}`,
        { method: "DELETE", headers: { "x-csrf-token": csrf(client) } },
        "The template couldn’t be deleted. Try again.",
      );
      return id;
    },
    onSuccess: (id) =>
      client.setQueryData<Template[]>(listKey, (list) =>
        (list ?? []).filter((item) => item.id !== id),
      ),
  });
}
