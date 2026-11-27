import { ChevronDown } from "lucide-react";
import type { AppError } from "../errors";
import styles from "./FailureDetail.module.css";

/** The technical side of a failure, folded away under the friendly message. */
export function FailureDetail({ error }: { error: AppError }) {
  if (!error.detail) return null;
  return (
    <details className={styles.details}>
      <summary>
        Details
        <ChevronDown aria-hidden="true" />
      </summary>
      <p>{error.detail}</p>
    </details>
  );
}
