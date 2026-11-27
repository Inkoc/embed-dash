import type { ReactNode } from "react";
import { ChevronDown, CircleAlert } from "lucide-react";
import { useEditorState } from "./editorState";
import styles from "./Disclosure.module.css";

interface Props {
  /** Remembers the row's state while parts move and views change. */
  openKey: string;
  id: string;
  /** The row itself: a name, a one-line summary and anything else the row shows. */
  head: ReactNode;
  /** A closed row with a problem says so, since its controls are out of sight. */
  needsFix?: boolean;
  className?: string;
  headClassName?: string;
  children: ReactNode;
}

/** One ruled row that folds a part of the embed away; the chevron turns when it opens. */
export function Disclosure({
  openKey,
  id,
  head,
  needsFix,
  className,
  headClassName,
  children,
}: Props) {
  const { isOpen, setOpen } = useEditorState();
  const open = isOpen(openKey);
  return (
    <div
      className={[styles.disclosure, className].filter(Boolean).join(" ")}
      data-open={open || undefined}
    >
      <button
        type="button"
        id={`${id}-toggle`}
        className={[styles.head, headClassName].filter(Boolean).join(" ")}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => setOpen(openKey, !open)}
      >
        {head}
        {needsFix && !open && (
          <span className={styles.fix}>
            <CircleAlert aria-hidden="true" />
            Needs a fix
          </span>
        )}
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </button>
      <div id={`${id}-body`} className={styles.body}>
        <div className={styles.inner}>{children}</div>
      </div>
    </div>
  );
}
