import { useState } from "react";
import { ImageOff } from "lucide-react";
import { isAcceptedLink } from "@embed-dash/shared";
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

/** Only links Discord would show; anything else also fails validation. */
export const mediaUrl = (url: string) =>
  url.trim() && isAcceptedLink(url, true) ? url.trim() : "";

/**
 * Every picture in an embed. A link that doesn't load shows a placeholder in
 * its place, the way Discord marks a broken image, so the layout stays true.
 */
export function Media({ url, kind }: { url: string; kind: Kind }) {
  const [failed, setFailed] = useState("");
  const src = mediaUrl(url);
  if (!src) return null;
  const [width, height] = sizes[kind];
  const label = labels[kind];
  if (failed === src)
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
