import type { ChangeEvent } from "react";
import { textLength } from "@embed-dash/shared";
import styles from "./TextControl.module.css";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  rows?: number;
  optional?: boolean;
  /** Shown only while the control has focus. */
  focusHint?: string;
}

const format = (n: number) => n.toLocaleString("en-GB");

/** Counts show while the control has focus, or for good once text passes 90% of the limit. */
export function countLevel(length: number, max: number) {
  if (length > max) return "over";
  if (length > max * 0.9) return "near";
  return "ok";
}

export function TextControl({
  id,
  label,
  value,
  onChange,
  max,
  rows,
  optional,
  focusHint,
}: Props) {
  const length = textLength(value);
  const describedBy = [`${id}-count`, focusHint && `${id}-hint`]
    .filter(Boolean)
    .join(" ");
  const shared = {
    id,
    value,
    "aria-describedby": describedBy,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };
  return (
    <div className={styles.control}>
      <div className={styles.top}>
        <label htmlFor={id}>
          {label}
          {optional && <span className={styles.optional}> (optional)</span>}
        </label>
        <span
          id={`${id}-count`}
          className={styles.count}
          data-level={countLevel(length, max)}
        >
          {format(length)}
          <span aria-hidden="true"> / </span>
          <span className="visually-hidden"> of </span>
          {format(max)}
          <span className="visually-hidden"> characters</span>
        </span>
      </div>
      {rows ? (
        <textarea {...shared} rows={rows} />
      ) : (
        <input {...shared} type="text" />
      )}
      {focusHint && (
        <p id={`${id}-hint`} className={styles.hint}>
          <span>{focusHint}</span>
        </p>
      )}
    </div>
  );
}
