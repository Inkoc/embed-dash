import { Link } from "react-router";
import { useLayoutEffect, useRef } from "react";
import { AccessWarning, SessionControls } from "./SessionGate";
import { ThemeSwitch } from "./ThemeSwitch";
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
  const header = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = header.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    // Sticky composer controls use the full header height, including the access notice.
    const measure = () =>
      document.documentElement.style.setProperty(
        "--bar-height",
        element.getBoundingClientRect().height + "px",
      );
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--bar-height");
    };
  }, []);
  return (
    <header className={styles.header} ref={header}>
      <AccessWarning />
      <div className={styles.bar}>
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
            <span className={styles.shortcutsLabel}>Shortcuts</span>
            <kbd data-k="help" aria-hidden="true">
              ?
            </kbd>
          </button>
          <SessionControls />
          <ThemeSwitch theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>
    </header>
  );
}
