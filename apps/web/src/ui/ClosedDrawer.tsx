import type { ReactNode } from "react";
import styles from "./ClosedDrawer.module.css";

/**
 * A view with nothing to show: a closed catalogue drawer whose label holder
 * names what is missing, beside a heading, the explanation and what to do next.
 */
export function ClosedDrawer({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.closed}>
      <div className={styles.drawer} aria-hidden="true">
        <span className={styles.holder}>{label}</span>
        <span className={styles.pull} />
      </div>
      <div className={styles.copy}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
