import { useState } from "react";
import type { Guild } from "@embed-dash/shared";
import { initials } from "./catalogue";
import styles from "./ServerMark.module.css";

/** The server's Discord icon, or the drawer label holder with its initials. */
export function ServerMark({
  guild,
  size = "md",
}: {
  guild: Pick<Guild, "name" | "iconUrl">;
  size?: "sm" | "md";
}) {
  const [failed, setFailed] = useState(false);
  if (guild.iconUrl && !failed)
    return (
      <img
        className={styles.icon}
        data-size={size}
        src={guild.iconUrl}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  return (
    <span className={styles.holder} data-size={size} aria-hidden="true">
      {initials(guild.name)}
    </span>
  );
}
