import { Link } from "react-router";
import { Moon, Sun } from "lucide-react";
import type { Theme } from "../theme";
import { Segmented, segmentedItem } from "../ui/Segmented";
import { BotStatus } from "./BotStatus";
import styles from "./TopBar.module.css";

export type View = "compose" | "send";

interface Props {
  view: View;
  theme: Theme;
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
}

const views = [
  { view: "compose", to: "/", label: "Compose" },
  { view: "send", to: "/send", label: "Send" },
] as const;

export function TopBar({ view, theme, onToggleTheme, onShowShortcuts }: Props) {
  return (
    <header className={styles.bar}>
      <Link to="/" className={styles.brand}>
        <img src="/icon.svg" alt="" width="28" height="28" />
        <span className={styles.brandName}>embed-dash</span>
      </Link>
      <nav aria-label="Main" className={styles.views}>
        <Segmented activeKey={view}>
          {views.map((item) => (
            <Link
              key={item.view}
              to={item.to}
              className={segmentedItem}
              aria-current={item.view === view ? "page" : undefined}
              data-active={item.view === view || undefined}
            >
              {item.label}
            </Link>
          ))}
        </Segmented>
      </nav>
      <div className={styles.end}>
        <BotStatus variant="bar" />
        <button
          type="button"
          className={styles.quiet}
          onClick={onShowShortcuts}
          aria-keyshortcuts="?"
        >
          Shortcuts
          <kbd data-k="help" aria-hidden="true">
            ?
          </kbd>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={theme === "dark"}
          className={styles.theme}
          onClick={onToggleTheme}
        >
          <span className={styles.track} aria-hidden="true">
            <span className={styles.knob} />
            <Sun className={styles.sun} />
            <Moon className={styles.moon} />
          </span>
          <span className={styles.themeLabel}>Dark theme</span>
        </button>
      </div>
    </header>
  );
}
