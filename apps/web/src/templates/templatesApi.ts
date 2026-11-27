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
import { connectionFailure, failureFrom, type Action } from "../errors";
import type { Session } from "../shell/SessionGate";

const listSchema = templateSchema.array();
const listKey = ["templates"];

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

export function useTemplates() {
  return useQuery({
    queryKey: listKey,
    retry: false,
    queryFn: async () => {
      const response = await call("load-templates", "/api/templates", {});
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
      const response = await call("save-template", "/api/templates", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf(client),
        },
        body: JSON.stringify(input),
      });
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
      const response = await call("change-template", `/api/templates/${id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf(client),
        },
        body: JSON.stringify(change),
      });
      return templateSchema.parse(await response.json());
    },
    onSuccess: (template) => putFirst(client, template),
  });
}

export function useDeleteTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await call("delete-template", `/api/templates/${id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrf(client) },
      });
      return id;
    },
    onSuccess: (id) =>
      client.setQueryData<Template[]>(listKey, (list) =>
        (list ?? []).filter((item) => item.id !== id),
      ),
  });
}
