import type { CSSProperties } from "react";
import { isAcceptedLink, type BotIdentity } from "@embed-dash/shared";
import type { Draft, Embed } from "../compose/draft";
import { fieldRows } from "./fieldRows";
import { previewSource } from "./media";
import styles from "./DiscordPreview.module.css";

interface Props {
  draft: Draft;
  /** Undefined while the bot is loading or unreachable. */
  bot: BotIdentity | undefined;
  botPending: boolean;
  /** When the message is shown as sent, such as "Today at 18:00". */
  time: string;
}

/** Only links Discord would show; anything else also fails validation. */
const shown = (url: string, draft: Draft) =>
  url.trim() && isAcceptedLink(url, true)
    ? previewSource(url.trim(), draft.attachments)
    : "";

/** Discord writes an embed's time as "Today at 18:00" or as a date and time. */
export function embedTime(timestamp: string, sent: string, now = new Date()) {
  if (timestamp === "now") return sent;
  const date = new Date(timestamp);
  if (!timestamp || Number.isNaN(date.getTime())) return "";
  const clock = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (date.toDateString() === now.toDateString()) return `Today at ${clock}`;
  return `${date.toLocaleDateString()} ${clock}`;
}

/**
 * One message as Discord's chat shows it. Text is rendered as plain text for
 * now; Discord markdown arrives with the full preview.
 */
export function DiscordPreview({ draft, bot, botPending, time }: Props) {
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
        {draft.embeds.map((embed) => (
          <PreviewEmbed
            key={embed.id}
            embed={embed}
            draft={draft}
            time={time}
          />
        ))}
      </div>
    </article>
  );
}

function PreviewEmbed({
  embed,
  draft,
  time,
}: {
  embed: Embed;
  draft: Draft;
  time: string;
}) {
  const thumbnail = shown(embed.thumbnail, draft);
  const image = shown(embed.image, draft);
  const rows = fieldRows(embed.fields, Boolean(thumbnail));
  const title = embed.title.trim();
  const description = embed.description.trim();
  const footer = embed.footer.text.trim();
  const author = embed.author.name.trim();
  const authorIcon = shown(embed.author.iconUrl, draft);
  const footerIcon = shown(embed.footer.iconUrl, draft);
  const when = embedTime(embed.timestamp, time);
  const color = /^#[0-9a-f]{6}$/i.test(embed.color) ? embed.color : undefined;

  return (
    <div
      className={styles.embed}
      style={color ? ({ "--embed-color": color } as CSSProperties) : undefined}
      data-testid="preview-embed"
    >
      <span className={styles.bar} aria-hidden="true" />
      <div className={styles.grid} data-thumbnail={thumbnail ? "" : undefined}>
        {author && (
          <p className={styles.author}>
            {authorIcon && (
              <img src={authorIcon} alt="" width="24" height="24" />
            )}
            <span data-link={embed.author.url.trim() ? "" : undefined}>
              {author}
            </span>
          </p>
        )}
        {title && (
          <p className={styles.title}>
            {embed.url.trim() ? (
              <span className={styles.link}>{title}</span>
            ) : (
              title
            )}
          </p>
        )}
        {description && <p className={styles.description}>{description}</p>}
        {rows.length > 0 && (
          <div className={styles.fields}>
            {rows.flat().map(({ field, start, end }) => (
              <div
                key={field.id}
                className={styles.field}
                style={{ gridColumn: `${start} / ${end}` }}
              >
                <p className={styles.fieldName}>{field.name.trim()}</p>
                <p className={styles.fieldValue}>{field.value.trim()}</p>
              </div>
            ))}
          </div>
        )}
        {image && (
          <img
            className={styles.image}
            src={image}
            alt="Embed image"
            width="400"
            height="200"
            loading="lazy"
          />
        )}
        {thumbnail && (
          <img
            className={styles.thumbnail}
            src={thumbnail}
            alt="Embed thumbnail"
            width="80"
            height="80"
          />
        )}
        {(footer || when) && (
          <p className={styles.footer}>
            {footer && footerIcon && (
              <img src={footerIcon} alt="" width="20" height="20" />
            )}
            <span>
              {footer}
              {footer && when && (
                <span className={styles.dot} aria-hidden="true">
                  •
                </span>
              )}
              {when}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
