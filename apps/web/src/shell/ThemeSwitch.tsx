import { Moon, Sun } from "lucide-react";
import type { Theme } from "../theme";
import styles from "./TopBar.module.css";

export function ThemeSwitch({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === "dark"}
      className={styles.theme}
      onClick={onToggle}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
        <Sun className={styles.sun} />
        <Moon className={styles.moon} />
      </span>
      <span data-shed-label="theme">Dark theme</span>
    </button>
  );
}
