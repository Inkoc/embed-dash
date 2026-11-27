import { useState } from "react";
import { ImageOff } from "lucide-react";
import { isAcceptedLink, type AttachmentDraft } from "@embed-dash/shared";
import { previewSource } from "./media";
import styles from "./DiscordPreview.module.css";

type Kind = "image" | "thumbnail" | "authorIcon" | "footerIcon";

const sizes: Record<Kind, [number, number]> = {
  image: [400, 200],
  thumbnail: [80, 80],
  authorIcon: [24, 24],
  footerIcon: [20, 20],
};
const labels: Partial<Record<Kind, string>> = {
  image: "Embed image",
  thumbnail: "Embed thumbnail",
};

/**
 * What the preview loads for a picture link, with an `attachment://` name
 * swapped for the uploaded file it points to. Null when Discord wouldn't show
 * the link at all (it also fails validation); empty when it names a file that
 * isn't attached, which is shown as a picture that didn't load.
 */
export const mediaSource = (
  url: string,
  attachments: readonly AttachmentDraft[],
) =>
  url.trim() && isAcceptedLink(url, true)
    ? previewSource(url.trim(), attachments)
    : null;

/**
 * Every picture in an embed. A link that doesn't load shows a placeholder in
 * its place, the way Discord marks a broken image, so the layout stays true.
 */
export function Media({
  url,
  kind,
  attachments,
}: {
  url: string;
  kind: Kind;
  attachments: readonly AttachmentDraft[];
}) {
  const [failed, setFailed] = useState("");
  const src = mediaSource(url, attachments);
  if (src === null) return null;
  const [width, height] = sizes[kind];
  const label = labels[kind];
  if (!src || failed === src)
    return (
      <span
        className={`${styles[kind]} ${styles.broken}`}
        role={label ? "img" : undefined}
        aria-label={label ? `${label} (didn’t load)` : undefined}
      >
        {label && <ImageOff aria-hidden="true" />}
      </span>
    );
  return (
    <img
      className={styles[kind]}
      src={src}
      alt={label ?? ""}
      width={width}
      height={height}
      loading={kind === "image" ? "lazy" : undefined}
      onError={() => setFailed(src)}
    />
  );
}
