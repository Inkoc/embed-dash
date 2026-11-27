import { useEffect, useRef } from "react";
import { CornerDownLeft, X } from "lucide-react";
import { isApplePlatform } from "../shortcuts";
import styles from "./ShortcutsDialog.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ open, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const modifier = isApplePlatform() ? "⌘" : "Ctrl";
  const shortcuts = [
    {
      keys: (
        <kbd>
          {modifier}
          <CornerDownLeft aria-hidden="true" />
          <span className="visually-hidden">Enter</span>
        </kbd>
      ),
      action: "Go forward: from Compose to Send",
    },
    { keys: <kbd>Esc</kbd>, action: "Go back: from Send to Compose" },
    { keys: <kbd>/</kbd>, action: "Jump to search, where a view has one" },
    { keys: <kbd>?</kbd>, action: "Show this list" },
  ];

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.sheet}>
        <div className={styles.head}>
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <dl className={styles.list}>
          {shortcuts.map((shortcut) => (
            <div key={shortcut.action} className={styles.row}>
              <dt>{shortcut.keys}</dt>
              <dd>{shortcut.action}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.note}>
          Shortcuts that use a letter or symbol pause while you type in a field.
        </p>
      </div>
    </dialog>
  );
}
