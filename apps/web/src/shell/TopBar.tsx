import { Link } from "react-router";
import { useLayoutEffect, useRef } from "react";
import { AccessWarning, SessionControls } from "./SessionGate";
import { ThemeSwitch } from "./ThemeSwitch";
import type { Theme } from "../theme";
import { Segmented, segmentedItem } from "../ui/Segmented";
import { BotStatus } from "./BotStatus";
import styles from "./TopBar.module.css";

export type View = "compose" | "send" | "templates";

interface Props {
  view: View;
  theme: Theme;
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
}

/** What the right cluster drops, in this order, when its share of the bar is too narrow. */
const shedOrder = ["shedTheme", "shedShortcuts", "shedBadge", "shedSignOut"];

/**
 * Whether everything in the cluster shows in full: nothing spills out, and the
 * part that gives way (the bot's name) isn't cut short of its own cap.
 */
function fits(cluster: HTMLElement) {
  // Boxes, not scrollWidth: the cluster is end-aligned, so it spills out to
  // the left, which scrollWidth doesn't count.
  const edge = cluster.getBoundingClientRect();
  for (const item of cluster.children) {
    const box = item.getBoundingClientRect();
    if (box.left < edge.left - 0.5 || box.right > edge.right + 0.5)
      return false;
  }
  const label = cluster.querySelector<HTMLElement>("[data-gives-way]");
  // scrollWidth rounds up, so a name that fits to the subpixel can read one over.
  if (!label || label.scrollWidth <= label.clientWidth + 1) return true;
  const cap = parseFloat(getComputedStyle(label).maxWidth);
  return label.clientWidth >= cap;
}

/** Sheds words one at a time until the cluster fits; the bot's name shortens only after all of them. */
function fit(cluster: HTMLElement) {
  for (const step of shedOrder) delete cluster.dataset[step];
  for (const step of shedOrder) {
    if (fits(cluster)) return;
    cluster.dataset[step] = "";
  }
}

const views = [
  { view: "compose", to: "/", label: "Compose" },
  { view: "send", to: "/send", label: "Send" },
  { view: "templates", to: "/templates", label: "Templates" },
] as const;

export function TopBar({ view, theme, onToggleTheme, onShowShortcuts }: Props) {
  const header = useRef<HTMLElement>(null);
  const end = useRef<HTMLDivElement>(null);
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
  // Measured rather than set by breakpoints: what fits depends on the sign-in
  // mode, the person's name and the bot's name, not only on the width.
  useLayoutEffect(() => {
    const cluster = end.current;
    if (!cluster || typeof ResizeObserver === "undefined") return;
    const refit = () => fit(cluster);
    const resized = new ResizeObserver(refit);
    resized.observe(cluster);
    const changed = new MutationObserver(refit);
    changed.observe(cluster, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    refit();
    void document.fonts?.ready.then(refit);
    return () => {
      resized.disconnect();
      changed.disconnect();
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
        <div className={styles.end} ref={end}>
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
