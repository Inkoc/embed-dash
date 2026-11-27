import { useState, type ReactNode } from "react";
import type { TimestampStyle } from "../compose/markdown";
import { parseMarkdown, type MarkdownNode, type Surface } from "./markdown";
import { formatTimestamp } from "./timestamp";
import styles from "./Markdown.module.css";

interface Props {
  text: string;
  surface: Surface;
  /** Relative timestamps count from here; tests pin it. */
  now?: Date;
}

/**
 * Discord-flavoured text as React elements. Nothing typed is ever turned into
 * HTML, and only web links become clickable.
 */
export function Markdown({ text, surface, now = new Date() }: Props) {
  return <>{nodes(parseMarkdown(text, surface), now)}</>;
}

// Blocks that end a line themselves: a line break right after one, or at the
// end of a quote, would add a blank line Discord doesn't show.
const blocks = new Set([
  "codeBlock",
  "blockQuote",
  "heading",
  "subtext",
  "list",
]);

function nodes(list: MarkdownNode[], now: Date): ReactNode[] {
  return list
    .filter(
      (node, i) => node.type !== "br" || !blocks.has(list[i - 1]?.type ?? ""),
    )
    .map((node, i) => <Node key={i} node={node} now={now} />);
}

const children = (node: MarkdownNode, now: Date) =>
  nodes(node.content as MarkdownNode[], now);
const isWebLink = (target: string) => /^https?:\/\//i.test(target);

const mentionFallback = {
  user: ["@unknown-user", "User"],
  role: ["@deleted-role", "Role"],
  channel: ["#unknown", "Channel"],
} as const;

function Node({ node, now }: { node: MarkdownNode; now: Date }): ReactNode {
  switch (node.type) {
    case "text":
    case "twemoji":
    case "emoticon":
      return (node.content ?? node.name) as string;
    case "br":
      return <br />;
    case "strong":
      return <strong>{children(node, now)}</strong>;
    case "em":
      return <em>{children(node, now)}</em>;
    case "underline":
      return <u>{children(node, now)}</u>;
    case "strikethrough":
      return <s>{children(node, now)}</s>;
    case "inlineCode":
      return <code className={styles.code}>{node.content as string}</code>;
    case "codeBlock":
      return (
        <pre className={styles.codeBlock}>
          <code>{node.content as string}</code>
        </pre>
      );
    case "blockQuote":
      return (
        <blockquote className={styles.quote}>
          {children(withoutTrailingBreak(node), now)}
        </blockquote>
      );
    case "heading":
      // Styled paragraphs rather than h1–h3: the preview's headings are
      // message text and must not enter the page's own outline.
      return (
        <p className={styles.heading} data-level={node.level as number}>
          {children(node, now)}
        </p>
      );
    case "subtext":
      return <small className={styles.subtext}>{children(node, now)}</small>;
    case "list": {
      const List = node.ordered ? "ol" : "ul";
      return (
        <List className={styles.list} start={node.start as number | undefined}>
          {(node.items as MarkdownNode[][]).map((item, i) => (
            <li key={i}>{nodes(item, now)}</li>
          ))}
        </List>
      );
    }
    case "spoiler":
      return <Spoiler>{children(node, now)}</Spoiler>;
    case "link":
    case "autolink":
    case "url": {
      const target = node.target as string;
      if (!isWebLink(target))
        return (
          <>
            [{children(node, now)}]({target})
          </>
        );
      return (
        <a
          className={styles.link}
          href={target}
          title={target}
          target="_blank"
          rel="noreferrer"
        >
          {children(node, now)}
        </a>
      );
    }
    case "user":
    case "role":
    case "channel": {
      const [label, kind] = mentionFallback[node.type];
      return (
        <span
          className={styles.mention}
          title={`${kind} ID ${node.id as string}`}
        >
          {label}
        </span>
      );
    }
    case "everyone":
    case "here":
      return <span className={styles.mention}>@{node.type}</span>;
    case "emoji":
      return <Emoji node={node} />;
    case "timestamp":
      return <Timestamp node={node} now={now} />;
    default:
      return null;
  }
}

function withoutTrailingBreak(node: MarkdownNode): MarkdownNode {
  const content = node.content as MarkdownNode[];
  return content.at(-1)?.type === "br"
    ? { ...node, content: content.slice(0, -1) }
    : node;
}

/** Hidden until clicked, as in Discord; once shown it stays shown. */
function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  if (shown)
    return (
      <span className={styles.spoiler} data-shown="">
        {children}
      </span>
    );
  return (
    <button
      type="button"
      className={styles.spoiler}
      aria-label="Spoiler, select to show"
      onClick={() => setShown(true)}
    >
      <span aria-hidden="true" inert>
        {children}
      </span>
    </button>
  );
}

/** Custom emoji come from Discord's own CDN; the name stands in if that fails. */
function Emoji({ node }: { node: MarkdownNode }) {
  const [failed, setFailed] = useState(false);
  const name = `:${node.name as string}:`;
  if (failed) return name;
  const id = node.id as string;
  const src = `https://cdn.discordapp.com/emojis/${id}.webp?size=48${node.animated ? "&animated=true" : ""}`;
  return (
    <img
      className={styles.emoji}
      src={src}
      alt={name}
      title={name}
      width="22"
      height="22"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

function Timestamp({ node, now }: { node: MarkdownNode; now: Date }) {
  const seconds = Number(node.timestamp);
  const date = new Date(seconds * 1000);
  const style = (node.format as TimestampStyle | undefined) ?? "f";
  if (Number.isNaN(date.getTime()))
    return `<t:${node.timestamp as string}${node.format ? `:${style}` : ""}>`;
  return (
    <time
      className={styles.timestamp}
      dateTime={date.toISOString()}
      title={formatTimestamp(date, "F", now)}
    >
      {formatTimestamp(date, style, now)}
    </time>
  );
}
