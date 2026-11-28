import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import {
  channelGroupNameKey,
  channelGroupNameMax,
  templateNameMax,
} from "@embed-dash/shared";
import { countLevel } from "../compose/TextControl";
import type { AppError } from "../errors";
import { FailureDetail } from "../ui/FailureDetail";
import dialogStyles from "../ui/ConfirmDialog.module.css";
import { keepTabInside } from "../ui/dialogTab";
import fieldStyles from "../compose/TextControl.module.css";
import styles from "./NameDialog.module.css";

/** What is being named: the label, example and limit follow from it. */
const subjects = {
  template: {
    label: "Template name",
    example: "Weekly digest",
    max: templateNameMax,
  },
  group: {
    label: "Group name",
    example: "Tournament news",
    max: channelGroupNameMax,
  },
} as const;
type Subject = keyof typeof subjects;

interface Props {
  open: boolean;
  subject?: Subject;
  title: string;
  children?: ReactNode;
  initialName: string;
  submitLabel: string;
  /** Names already in use; another of the same name, in any case, is refused. */
  taken?: readonly string[];
  /** While the server is answering: the only time the submit button is disabled. */
  pending: boolean;
  /** Why the server refused the name or the save, with its detail. */
  error?: AppError | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

const problemFor = (
  subject: Subject,
  name: string,
  taken: readonly string[],
) => {
  const length = name.trim().length;
  const { max } = subjects[subject];
  if (length === 0) return `Give the ${subject} a name.`;
  if (length > max)
    return `Use at most ${max} characters; this name has ${length}.`;
  const clash = taken.find(
    (other) => channelGroupNameKey(other) === channelGroupNameKey(name),
  );
  if (clash)
    return `Another ${subject} is already called “${clash}”. Choose a different name.`;
  return undefined;
};

/** Asks for a template's or group's name, for saving a new one and for renaming. */
export function NameDialog({
  open,
  subject = "template",
  title,
  children,
  initialName,
  submitLabel,
  taken = [],
  pending,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [left, setLeft] = useState(false);
  // The save and rename dialogs can share a view, so their ids must not collide.
  const id = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setName(initialName);
      setLeft(false);
      element.showModal();
      input.current?.select();
    }
    if (!open && element.open) element.close();
  }, [open, initialName]);

  const { label, example, max } = subjects[subject];
  const problem = left ? problemFor(subject, name, taken) : undefined;
  const length = name.trim().length;
  const describedBy = [
    `${id}-name-count`,
    problem && `${id}-name-problem`,
    error && `${id}-name-error`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <dialog
      ref={dialog}
      className={dialogStyles.dialog}
      aria-labelledby={`${id}-title`}
      onClose={onCancel}
      onKeyDown={keepTabInside}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        className={dialogStyles.sheet}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (problemFor(subject, name, taken)) {
            setLeft(true);
            input.current?.focus();
            return;
          }
          onSubmit(name.trim());
        }}
      >
        <h2 id={`${id}-title`}>{title}</h2>
        {children && <div className={dialogStyles.body}>{children}</div>}
        <div className={`${fieldStyles.control} ${styles.control}`}>
          <div className={fieldStyles.top}>
            <label htmlFor={`${id}-name`}>{label}</label>
            <span
              id={`${id}-name-count`}
              className={fieldStyles.count}
              data-level={countLevel(length, max)}
            >
              {length}
              <span aria-hidden="true"> / </span>
              <span className="visually-hidden"> of </span>
              {max}
              <span className="visually-hidden"> characters</span>
            </span>
          </div>
          <input
            ref={input}
            id={`${id}-name`}
            className={fieldStyles.field}
            type="text"
            autoComplete="off"
            placeholder={example}
            value={name}
            aria-invalid={problem ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setLeft(true)}
          />
          {problem && (
            <p id={`${id}-name-problem`} className={fieldStyles.problem}>
              <CircleAlert aria-hidden="true" />
              <span>{problem}</span>
            </p>
          )}
          {error && (
            <p
              id={`${id}-name-error`}
              className={fieldStyles.problem}
              role="alert"
            >
              <CircleAlert aria-hidden="true" />
              <span>{error.message}</span>
            </p>
          )}
          {error && <FailureDetail error={error} />}
        </div>
        <div className={dialogStyles.actions}>
          <button
            type="button"
            className={dialogStyles.cancel}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={dialogStyles.primary}
            disabled={pending}
          >
            {pending ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
