import type { AttachmentDraft } from "@embed-dash/shared";
import { attachmentName } from "@embed-dash/shared";
import { contentUrl, isImage } from "../compose/uploads";

/** What an `attachment://` link shows locally: the stored image, or nothing when no attached image has that name. */
export function previewSource(
  url: string,
  attachments: readonly AttachmentDraft[],
): string {
  const name = attachmentName(url);
  if (name === null) return url;
  const file = attachments.find((item) => item.filename === name);
  return file && isImage(file) ? contentUrl(file.id) : "";
}
