import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { attachmentSchema, type AttachmentDraft } from "@embed-dash/shared";

/** Only images are served back; they are what the preview can show. */
export const contentUrl = (id: string) => `/api/uploads/${id}/content`;
export const isImage = (file: Pick<AttachmentDraft, "contentType">) =>
  file.contentType.startsWith("image/");

const failure = (status: number) =>
  status === 413
    ? "The server refused the file as too large."
    : status === 401 || status === 403
      ? "Your session changed. Refresh the page and try again."
      : "The upload failed. Try again.";

export async function uploadFile(
  file: File,
  filename: string,
  csrfToken: string,
): Promise<AttachmentDraft> {
  const body = new FormData();
  body.append("file", file, filename);
  let response: Response;
  try {
    response = await fetch("/api/uploads", {
      method: "POST",
      headers: { "x-csrf-token": csrfToken },
      body,
    });
  } catch {
    throw new Error("Unable to connect. Check your connection and try again.");
  }
  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error ?? failure(response.status));
  }
  return attachmentSchema.parse(await response.json());
}

/** Best effort: a file left behind only costs disk space. */
export const discardUpload = (id: string, csrfToken: string) =>
  fetch(`/api/uploads/${id}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrfToken },
  }).catch(() => undefined);

/**
 * Whether the server still has a file the draft refers to. The draft is kept
 * in the browser, so after a reload or a wiped data directory it can name
 * files that no longer exist.
 */
const presence = (id: string) => ({
  queryKey: ["upload", id],
  retry: false,
  staleTime: Infinity,
  queryFn: async () => {
    const response = await fetch(`/api/uploads/${id}`);
    if (response.status === 404) return false;
    if (!response.ok) throw new Error("Unable to check the file.");
    return true;
  },
});

export function useUploadPresent(id: string) {
  const query = useQuery(presence(id));
  return query.data === false ? "missing" : "present";
}

/** Ids of the draft's files the server is known to have lost; sending finds out for the rest. */
export function useMissingUploads(ids: readonly string[]): ReadonlySet<string> {
  const key = useQueries({
    queries: ids.map(presence),
    combine: (results) =>
      ids.filter((_, i) => results[i]?.data === false).join(","),
  });
  return useMemo(() => new Set(key ? key.split(",") : []), [key]);
}
