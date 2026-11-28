import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { templateNameMax } from "@embed-dash/shared";
import { countLevel } from "../compose/TextControl";
import type { AppError } from "../errors";
import { FailureDetail } from "../ui/FailureDetail";
import dialogStyles from "../ui/ConfirmDialog.module.css";
import { keepTabInside } from "../ui/dialogTab";
import fieldStyles from "../compose/TextControl.module.css";
import styles from "./NameDialog.module.css";

interface Props {
  open: boolean;
  title: string;
  children?: ReactNode;
  initialName: string;
  submitLabel: string;
  /** While the server is answering: the only time the submit button is disabled. */
  pending: boolean;
  /** Why the server refused the name or the save, with its detail. */
  error?: AppError | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

const problemFor = (name: string) => {
  const length = name.trim().length;
  if (length === 0) return "Give the template a name.";
  if (length > templateNameMax)
    return `Use at most ${templateNameMax} characters; this name has ${length}.`;
  return undefined;
};

/** Asks for a template's name, for saving a new one and for renaming. */
export function NameDialog({
  open,
  title,
  children,
  initialName,
  submitLabel,
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

  const problem = left ? problemFor(name) : undefined;
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
          if (problemFor(name)) {
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
            <label htmlFor={`${id}-name`}>Template name</label>
            <span
              id={`${id}-name-count`}
              className={fieldStyles.count}
              data-level={countLevel(length, templateNameMax)}
            >
              {length}
              <span aria-hidden="true"> / </span>
              <span className="visually-hidden"> of </span>
              {templateNameMax}
              <span className="visually-hidden"> characters</span>
            </span>
          </div>
          <input
            ref={input}
            id={`${id}-name`}
            className={fieldStyles.field}
            type="text"
            autoComplete="off"
            placeholder="Weekly digest"
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
