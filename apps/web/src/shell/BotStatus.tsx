import { RotateCw, X } from "lucide-react";
import { botInitial, botShortReason, useBot } from "../bot";
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
        <span className={styles.label} data-gives-way data-shed-label="bot">
          Connecting to Discord…
        </span>
      </p>
    ) : null;
  if (bot.isError) {
    const short = botShortReason(bot.error);
    return (
      <div className={styles[variant]} data-state="error" role="alert">
        <X className={styles.icon} aria-hidden="true" />
        {variant === "bar" ? (
          // The full reason and its fix show on hover here, and in the notice when the bar sheds the failure.
          <p title={bot.error.reason}>
            Not connected{short && `: ${short}`}
            <span className="visually-hidden">. {bot.error.reason}</span>
          </p>
        ) : (
          <p>{bot.error.message}</p>
        )}
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
  }
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
      <span className={styles.label} data-gives-way data-shed-label="bot">
        Bot <b>{bot.data.name}</b>
      </span>
    </p>
  ) : null;
}
