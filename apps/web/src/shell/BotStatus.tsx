import { RotateCw, X } from "lucide-react";
import { botErrorMessage, botInitial, useBot } from "../bot";
import styles from "./BotStatus.module.css";

/**
 * The connected bot. In the bar it is a line with the bot's name, shortened on
 * tablets and reduced to its avatar on phones. On phones a failure moves out
 * of the bar into a notice above the view, where the full message fits.
 */
export function BotStatus({ variant }: { variant: "bar" | "notice" }) {
  const bot = useBot();
  if (bot.isPending)
    return variant === "bar" ? (
      <p className={styles.bar} data-state="loading" role="status">
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label} data-gives-way>
          Connecting to Discord…
        </span>
      </p>
    ) : null;
  if (bot.isError)
    return (
      <div className={styles[variant]} data-state="error" role="alert">
        <X className={styles.icon} aria-hidden="true" />
        <p>
          {variant === "bar" ? (
            <>
              Not connected
              <span className="visually-hidden">. {botErrorMessage}</span>
            </>
          ) : (
            botErrorMessage
          )}
        </p>
        <button
          type="button"
          className={styles.retry}
          onClick={() => void bot.refetch()}
          disabled={bot.isFetching}
          aria-label="Retry connection"
        >
          <RotateCw aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  return variant === "bar" ? (
    <p className={styles.bar} data-state="connected">
      {bot.data.avatarUrl ? (
        <img src={bot.data.avatarUrl} alt="" width="20" height="20" />
      ) : (
        <>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.initial} aria-hidden="true">
            {botInitial(bot.data.name)}
          </span>
        </>
      )}
      <span className={styles.label} data-gives-way>
        Bot <b>{bot.data.name}</b>
      </span>
    </p>
  ) : null;
}
