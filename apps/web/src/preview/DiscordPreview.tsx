import type { CSSProperties } from "react";
import type { BotIdentity } from "@embed-dash/shared";
import type { Draft } from "../compose/draft";
import { fieldRows } from "./fieldRows";
import styles from "./DiscordPreview.module.css";

interface Props {
  draft: Draft;
  /** Undefined while the bot is loading or unreachable. */
  bot: BotIdentity | undefined;
  botPending: boolean;
  time: string;
}

/**
 * One message as Discord's chat shows it. Text is rendered as plain text for
 * now; Discord markdown arrives with the full editor.
 */
export function DiscordPreview({ draft, bot, botPending, time }: Props) {
  const hasThumbnail = Boolean(draft.thumbnail);
  const rows = fieldRows(draft.fields, hasThumbnail);
  const title = draft.title.trim();
  const description = draft.description.trim();
  const footer = draft.footer.text.trim();
  const author = draft.author.name.trim();
  const content = draft.content.trim();
  const botName = bot?.name ?? "Your bot";

  return (
    <article className={styles.message} aria-label="Message preview">
      {bot?.avatarUrl ? (
        <img
          className={styles.avatar}
          src={bot.avatarUrl}
          alt=""
          width="40"
          height="40"
        />
      ) : (
        <span
          className={styles.avatar}
          data-placeholder={botPending ? "loading" : "initial"}
          aria-hidden="true"
        >
          {botPending ? "" : botName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className={styles.body}>
        <p className={styles.head}>
          {botPending ? (
            <span className={styles.nameSkeleton}>
              <span className="visually-hidden">Loading the bot's name</span>
            </span>
          ) : (
            <span className={styles.name}>{botName}</span>
          )}
          <span className={styles.app}>App</span>
          <time className={styles.time}>{time}</time>
        </p>
        {content && <p className={styles.content}>{content}</p>}
        <div
          className={styles.embed}
          style={{ "--embed-color": draft.color } as CSSProperties}
          data-testid="preview-embed"
        >
          <span className={styles.bar} aria-hidden="true" />
          <div
            className={styles.grid}
            data-thumbnail={hasThumbnail || undefined}
          >
            {author && (
              <p className={styles.author}>
                {draft.author.iconUrl && (
                  <img
                    src={draft.author.iconUrl}
                    alt=""
                    width="24"
                    height="24"
                  />
                )}
                <span>{author}</span>
              </p>
            )}
            {title && (
              <p className={styles.title}>
                {draft.url ? (
                  <span className={styles.link}>{title}</span>
                ) : (
                  title
                )}
              </p>
            )}
            {description && <p className={styles.description}>{description}</p>}
            {rows.length > 0 && (
              <div className={styles.fields}>
                {rows.flat().map(({ field, start, end }, index) => (
                  <div
                    key={index}
                    className={styles.field}
                    style={{ gridColumn: `${start} / ${end}` }}
                  >
                    <p className={styles.fieldName}>{field.name.trim()}</p>
                    <p className={styles.fieldValue}>{field.value.trim()}</p>
                  </div>
                ))}
              </div>
            )}
            {draft.image && (
              <img
                className={styles.image}
                src={draft.image}
                alt="Embed image"
                width="400"
                height="200"
                loading="lazy"
              />
            )}
            {hasThumbnail && (
              <img
                className={styles.thumbnail}
                src={draft.thumbnail}
                alt="Embed thumbnail"
                width="80"
                height="80"
              />
            )}
            {(footer || draft.timestamp) && (
              <p className={styles.footer}>
                {draft.footer.iconUrl && (
                  <img
                    src={draft.footer.iconUrl}
                    alt=""
                    width="20"
                    height="20"
                  />
                )}
                <span>
                  {footer}
                  {footer && draft.timestamp && (
                    <span className={styles.dot} aria-hidden="true">
                      •
                    </span>
                  )}
                  {draft.timestamp && time}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
