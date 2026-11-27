import { RotateCw, X } from "lucide-react";
import { botErrorMessage, useBot } from "../bot";
import styles from "./BotStatus.module.css";

/**
 * The connected bot. In the bar it is a compact line; on narrow screens, where
 * the bar has no room, only a failure is shown, as a notice above the view.
 */
export function BotStatus({ variant }: { variant: "bar" | "notice" }) {
  const bot = useBot();
  if (bot.isPending)
    return variant === "bar" ? (
      <p className={styles.bar} data-state="loading" role="status">
        <span className={styles.dot} aria-hidden="true" />
        Connecting to Discord…
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
        <span className={styles.dot} aria-hidden="true" />
      )}
      <span>
        Bot <b>{bot.data.name}</b>
      </span>
    </p>
  ) : null;
}
