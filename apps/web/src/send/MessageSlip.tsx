import type { CSSProperties } from "react";
import { Link } from "react-router";
import { PenLine } from "lucide-react";
import { isBlank, type Draft } from "../compose/draft";
import { messageSummary } from "./summary";
import styles from "./MessageSlip.module.css";

const counted = (n: number, one: string, many: string) => (
  <>
    <span className={styles.n}>{n}</span> {n === 1 ? one : many}
  </>
);

/** What is about to go out, in one line, kept in view while channels are picked. */
export function MessageSlip({ draft }: { draft: Draft }) {
  if (isBlank(draft))
    return (
      <div className={styles.slip} data-blank="">
        <p className={styles.what}>
          <span className={styles.label}>Sending</span>{" "}
          <b>Nothing written yet</b>
        </p>
        <Link to="/" className={styles.edit}>
          <PenLine aria-hidden="true" />
          Write it in Compose
        </Link>
      </div>
    );
  const summary = messageSummary(draft);
  const parts = [
    summary.text ? <>text</> : null,
    summary.embeds ? counted(summary.embeds, "embed", "embeds") : null,
    summary.files ? counted(summary.files, "file", "files") : null,
  ].filter((part) => part !== null);
  return (
    <div className={styles.slip}>
      <p className={styles.what}>
        <span className={styles.label}>Sending</span>{" "}
        {summary.embeds > 0 && summary.color && (
          <span
            className={styles.dot}
            // The embed's own side colour: user content, not the app palette.
            style={{ "--embed-color": summary.color } as CSSProperties}
            aria-hidden="true"
          />
        )}
        <b className={styles.headline}>{summary.headline}</b>{" "}
        <span className={styles.parts}>
          {parts.map((part, i) => (
            <span key={i}>
              {i > 0 && " · "}
              {part}
            </span>
          ))}
        </span>
      </p>
      <Link to="/" className={styles.edit}>
        <PenLine aria-hidden="true" />
        Edit in Compose
      </Link>
    </div>
  );
}
