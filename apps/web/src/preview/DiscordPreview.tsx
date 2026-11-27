import type { CSSProperties } from "react";
import type { BotIdentity } from "@embed-dash/shared";
import type { Draft, Embed } from "../compose/draft";
import { fieldRows } from "./fieldRows";
import { Markdown } from "./Markdown";
import { Media, mediaSource } from "./EmbedMedia";
import styles from "./DiscordPreview.module.css";

interface Props {
  draft: Draft;
  /** Undefined while the bot is loading or unreachable. */
  bot: BotIdentity | undefined;
  botPending: boolean;
  /** When the message is shown as sent, such as "Today at 18:00". */
  time: string;
}

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
 * One message as Discord's chat shows it, each part with the formatting
 * Discord gives that part (see docs/preview-fidelity.md).
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
        {content && (
          <div className={styles.content}>
            <Markdown text={content} surface="rich" />
          </div>
        )}
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
  const { attachments } = draft;
  const hasThumbnail = mediaSource(embed.thumbnail, attachments) !== null;
  const rows = fieldRows(embed.fields, hasThumbnail);
  const title = embed.title.trim();
  const description = embed.description.trim();
  const footer = embed.footer.text.trim();
  const author = embed.author.name.trim();
  const when = embedTime(embed.timestamp, time);
  const color = /^#[0-9a-f]{6}$/i.test(embed.color) ? embed.color : undefined;

  return (
    <div
      className={styles.embed}
      style={color ? ({ "--embed-color": color } as CSSProperties) : undefined}
      data-testid="preview-embed"
      data-embed=""
    >
      <span className={styles.bar} aria-hidden="true" />
      <div
        className={styles.grid}
        data-thumbnail={hasThumbnail ? "" : undefined}
      >
        {author && (
          <p className={styles.author}>
            <Media
              url={embed.author.iconUrl}
              kind="authorIcon"
              attachments={attachments}
            />
            <span data-link={embed.author.url.trim() ? "" : undefined}>
              <Markdown text={author} surface="plain" />
            </span>
          </p>
        )}
        {title && (
          <p className={styles.title}>
            <span
              className={embed.url.trim() ? styles.link : undefined}
              data-linked={embed.url.trim() ? "" : undefined}
            >
              <Markdown text={title} surface="inline" />
            </span>
          </p>
        )}
        {description && (
          <div className={styles.description}>
            <Markdown text={description} surface="rich" />
          </div>
        )}
        {rows.length > 0 && (
          <div className={styles.fields}>
            {rows.flat().map(({ field, start, end }) => (
              <div
                key={field.id}
                className={styles.field}
                style={{ gridColumn: `${start} / ${end}` }}
              >
                <p className={styles.fieldName}>
                  <Markdown text={field.name.trim()} surface="inline" />
                </p>
                <div className={styles.fieldValue}>
                  <Markdown text={field.value.trim()} surface="rich" />
                </div>
              </div>
            ))}
          </div>
        )}
        <Media url={embed.image} kind="image" attachments={attachments} />
        <Media
          url={embed.thumbnail}
          kind="thumbnail"
          attachments={attachments}
        />
        {(footer || when) && (
          <p className={styles.footer}>
            {footer && (
              <Media
                url={embed.footer.iconUrl}
                kind="footerIcon"
                attachments={attachments}
              />
            )}
            <span>
              <Markdown text={footer} surface="plain" />
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
