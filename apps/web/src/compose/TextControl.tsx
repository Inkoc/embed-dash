import type { ChangeEvent } from "react";
import { CircleAlert, ImageOff } from "lucide-react";
import { countedLength, textLength } from "@embed-dash/shared";
import { useDraft } from "./draft";
import { useEditorState } from "./editorState";
import { FormatEditor } from "./FormatEditor";
import { useImageFailed } from "./imageCheck";
import styles from "./TextControl.module.css";

interface Props {
  className?: string;
  id: string;
  /** The issue path this control answers for, such as `embeds.0.title`. */
  path: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  rows?: number;
  optional?: boolean;
  /** Discord's markdown toolbar and shortcuts, for the surfaces that render it. */
  format?: boolean;
  /** Links get a URL keyboard and no spell checking. */
  link?: boolean;
  /** An image link: one that doesn't load says so here, not only in the preview. */
  image?: boolean;
  placeholder?: string;
  /** Shown only while the control has focus. */
  focusHint?: string;
  /** Message text counts as typed; embed text is trimmed first, as Discord does. */
  untrimmed?: boolean;
}

const format = (n: number) => n.toLocaleString("en-GB");

/** Counts show while the control has focus, or for good once text passes 90% of the limit. */
export function countLevel(length: number, max: number) {
  if (length > max) return "over";
  if (length > max * 0.9) return "near";
  return "ok";
}

/** A problem shows once the control has been left, so nobody is scolded mid-word. */
export function useProblem(id: string, path: string) {
  const { issues } = useDraft();
  const { isTouched } = useEditorState();
  return isTouched(id)
    ? issues.find((issue) => issue.path === path)?.message
    : undefined;
}

export function Problem({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className={styles.problem}>
      <CircleAlert aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

export function TextControl({
  className,
  id,
  path,
  label,
  value,
  onChange,
  max,
  rows,
  optional,
  format: formatted,
  link,
  image,
  placeholder,
  focusHint,
  untrimmed,
}: Props) {
  const { touch } = useEditorState();
  const { draft } = useDraft();
  const problem = useProblem(id, path);
  const failed = useImageFailed(image ? value : "", draft.attachments);
  // A validation problem says more; the load failure waits until it is fixed.
  const broken = failed && !problem;
  const length = untrimmed ? textLength(value) : countedLength(value);
  const describedBy = [
    max && `${id}-count`,
    focusHint && `${id}-hint`,
    problem && `${id}-problem`,
    broken && `${id}-broken`,
  ]
    .filter(Boolean)
    .join(" ");
  const shared = {
    id,
    className: styles.field,
    value,
    placeholder,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": problem ? true : undefined,
    onBlur: () => touch(id),
  };
  const onInput = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => onChange(event.target.value);
  return (
    <div className={[styles.control, className].filter(Boolean).join(" ")}>
      <div className={styles.top}>
        <label htmlFor={id}>
          {label}
          {optional && <span className={styles.optional}> (optional)</span>}
        </label>
        {max !== undefined && (
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
        )}
      </div>
      {formatted ? (
        <FormatEditor
          {...shared}
          label={label}
          rows={rows}
          onChange={onChange}
        />
      ) : rows ? (
        <textarea {...shared} rows={rows} onChange={onInput} />
      ) : (
        <input
          {...shared}
          type={link ? "url" : "text"}
          inputMode={link ? "url" : undefined}
          spellCheck={link ? false : undefined}
          autoComplete="off"
          onChange={onInput}
        />
      )}
      <Problem id={`${id}-problem`} message={problem} />
      {broken && (
        <p id={`${id}-broken`} className={styles.problem} role="status">
          <ImageOff aria-hidden="true" />
          <span>
            This image didn’t load. Check that the link is right and public;
            otherwise Discord shows it as broken too.
          </span>
        </p>
      )}
      {focusHint && (
        <p id={`${id}-hint`} className={styles.hint}>
          <span>{focusHint}</span>
        </p>
      )}
    </div>
  );
}
