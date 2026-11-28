import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./ConfirmDialog.module.css";
import { keepTabInside } from "./dialogTab";

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red only when the action destroys work; sending is an ordinary, deliberate step. */
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before something that can't be undone; Cancel has focus, so Enter is the safe answer. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const bodyId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      cancel.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onClose={onCancel}
      onKeyDown={keepTabInside}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className={styles.sheet}>
        <h2 id={titleId}>{title}</h2>
        <div id={bodyId} className={styles.body}>
          {children}
        </div>
        <div className={styles.actions}>
          <button
            ref={cancel}
            type="button"
            className={styles.cancel}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button type="button" className={styles[tone]} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
