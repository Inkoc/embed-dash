import { useEffect, useState } from "react";
import type { AttachmentDraft } from "@embed-dash/shared";
import { mediaSource } from "../preview/EmbedMedia";

/** Long enough that a link being typed isn't tried at every keystroke. */
export const imageCheckDelayMs = 600;

/**
 * Whether an image link failed to load, tried the way the preview loads it
 * (an `attachment://` name goes to the uploaded file). Links Discord wouldn't
 * accept, and names of files that aren't attached, are left to validation.
 */
export function useImageFailed(
  url: string,
  attachments: readonly AttachmentDraft[],
) {
  const src = mediaSource(url, attachments);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    let current = true;
    const image = new Image();
    const timer = setTimeout(() => {
      image.onload = () => current && setFailed(null);
      image.onerror = () => current && setFailed(src);
      image.src = src;
    }, imageCheckDelayMs);
    return () => {
      current = false;
      clearTimeout(timer);
      image.onload = image.onerror = null;
    };
  }, [src]);
  return !!src && failed === src;
}
