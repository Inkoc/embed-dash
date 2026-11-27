import { countLevel } from "./TextControl";
import styles from "./BudgetRuler.module.css";

const format = (n: number) => n.toLocaleString("en-GB");

/** Discord's 6,000-character embed budget as a ruler with a tick per 1,000. */
export function BudgetRuler({ total, max }: { total: number; max: number }) {
  return (
    <div className={styles.budget}>
      <span>Embed text</span>
      <span className={styles.number}>
        <b>{format(total)}</b>
        <span aria-hidden="true"> / </span>
        <span className="visually-hidden"> of </span>
        {format(max)}
      </span>
      <span
        className={styles.ruler}
        data-level={countLevel(total, max)}
        aria-hidden="true"
      >
        <span
          className={styles.fill}
          style={{ transform: `scaleX(${Math.min(1, total / max)})` }}
        />
      </span>
    </div>
  );
}
