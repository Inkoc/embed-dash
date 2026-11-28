import { Link } from "react-router";
import { useLayoutEffect, useRef } from "react";
import { AccessWarning, SessionControls } from "./SessionGate";
import { ThemeSwitch } from "./ThemeSwitch";
import type { Theme } from "../theme";
import { Segmented, segmentedItem } from "../ui/Segmented";
import { BotStatus } from "./BotStatus";
import styles from "./TopBar.module.css";

export type View = "compose" | "send" | "history" | "templates";

interface Props {
  view: View;
  editing?: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
}

/**
 * What the bar sheds when it is short of room, in order, each with the widths
 * where it is shed outright. First the cluster's words go, so it fits its
 * share; the bot's name shortens only after all of them.
 */
const words = [
  ["shedTheme", "(max-width: 860px)"],
  ["shedShortcuts", "(max-width: 860px)"],
  ["shedBadge", "(max-width: 860px)"],
  ["shedSignOut", "(max-width: 860px)"],
] as const;
/**
 * Then, only if something would still overlap (a large root font size on a
 * tablet, say), one change at a time: the control moves to a second row, and
 * only if the first row still can't hold the rest does the brand's name go,
 * then the bot's name. The second row comes first because it frees the most
 * room; dropping a name first rarely saved the row, so the bar used to lose
 * both names and its row in a single step.
 */
const room = [
  ["stacked", "(max-width: 639.98px)"],
  ["shedBrand", "(max-width: 719.98px)"],
  ["shedBot", "(max-width: 640px)"],
] as const;

const matches = (query: string) => window.matchMedia?.(query).matches ?? false;

/** Whether one box lies inside another, give or take a subpixel. */
const within = (inner: DOMRect, outer: DOMRect) =>
  inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;

/**
 * Whether everything in the cluster shows in full: nothing spills out, and the
 * part that gives way (the bot's name) isn't cut short of its own cap.
 */
function fits(cluster: HTMLElement) {
  if (!clusterClear(cluster)) return false;
  const label = cluster.querySelector<HTMLElement>("[data-gives-way]");
  // scrollWidth rounds up, so a name that fits to the subpixel can read one over.
  if (!label || label.scrollWidth <= label.clientWidth + 1) return true;
  const cap = parseFloat(getComputedStyle(label).maxWidth);
  return label.clientWidth >= cap;
}

function clusterClear(cluster: HTMLElement) {
  // Boxes, not scrollWidth: the cluster is end-aligned, so it spills out to
  // the left, which scrollWidth doesn't count.
  const edge = cluster.getBoundingClientRect();
  for (const item of cluster.children) {
    const box = item.getBoundingClientRect();
    // A shed item has no box, and a notice hanging below the bar isn't in the row.
    if (box.width === 0 && box.height === 0) continue;
    if (getComputedStyle(item).position === "absolute") continue;
    if (!within(box, edge)) return false;
  }
  return true;
}

/** Whether nothing in the bar overlaps or runs out of it. */
function clear(bar: HTMLElement, cluster: HTMLElement) {
  if (bar.scrollWidth > bar.clientWidth + 1 || !clusterClear(cluster))
    return false;
  const [brand, nav] = bar.children;
  const track = nav?.firstElementChild;
  if (!brand || !nav || !track) return true;
  const trackBox = track.getBoundingClientRect();
  // A second row puts the control under the brand and the cluster, not beside them.
  const below = (box: DOMRect) => trackBox.top >= box.bottom - 0.5;
  const brandBox = brand.getBoundingClientRect();
  const clusterBox = cluster.getBoundingClientRect();
  return (
    within(trackBox, nav.getBoundingClientRect()) &&
    (below(brandBox) || brandBox.right <= trackBox.left + 0.5) &&
    (below(clusterBox) || trackBox.right <= clusterBox.left + 0.5)
  );
}

/** Sheds one step at a time until the bar fits. */
function fit(header: HTMLElement, bar: HTMLElement, cluster: HTMLElement) {
  for (const [step, query] of [...words, ...room]) {
    if (matches(query)) header.dataset[step] = "";
    else delete header.dataset[step];
  }
  for (const [step] of words) {
    if (fits(cluster)) break;
    header.dataset[step] = "";
  }
  for (const [step] of room) {
    if (clear(bar, cluster)) return;
    header.dataset[step] = "";
  }
}

const views = [
  { view: "compose", to: "/", label: "Compose" },
  { view: "send", to: "/send", label: "Send" },
  { view: "history", to: "/history", label: "History" },
  { view: "templates", to: "/templates", label: "Templates" },
] as const;

export function TopBar({
  view,
  theme,
  onToggleTheme,
  onShowShortcuts,
  editing,
}: Props) {
  const header = useRef<HTMLElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  // Measured rather than set by breakpoints alone: what fits depends on the
  // sign-in mode, the person's name, the bot's name and the root font size.
  useLayoutEffect(() => {
    const element = header.current;
    const row = bar.current;
    const cluster = end.current;
    if (!element || !row || !cluster) return;
    let height = "";
    const refit = () => {
      fit(element, row, cluster);
      // Sticky composer controls use the full header height, including the access notice.
      const next = element.getBoundingClientRect().height + "px";
      if (next === height) return;
      height = next;
      document.documentElement.style.setProperty("--bar-height", next);
    };
    // Observers, mutations and font loads can all report in one frame; they
    // share one refit in the next frame. Refitting inside an observer's
    // callback would resize what it watches and trip the browser's
    // ResizeObserver loop warning.
    let frame = 0;
    let live = true;
    const schedule = () => {
      if (frame || !live) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        refit();
      });
    };
    const stop = () => {
      live = false;
      cancelAnimationFrame(frame);
      document.documentElement.style.removeProperty("--bar-height");
    };
    // Fitted once whatever the browser supports, before the first paint;
    // observers only keep it fitted.
    refit();
    void document.fonts?.ready.then(schedule);
    if (typeof ResizeObserver === "undefined") {
      addEventListener("resize", schedule);
      return () => {
        removeEventListener("resize", schedule);
        stop();
      };
    }
    // Above 860px the cluster's box is a fixed share of the bar, so its own
    // size doesn't change when what's inside it grows; each item is watched
    // too, as are font loads, so a late change still refits.
    const resized = new ResizeObserver(schedule);
    const watch = () => {
      for (const part of [element, cluster, ...cluster.children])
        resized.observe(part);
    };
    watch();
    const changed = new MutationObserver(() => {
      watch();
      schedule();
    });
    changed.observe(cluster, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.fonts?.addEventListener("loadingdone", schedule);
    return () => {
      resized.disconnect();
      changed.disconnect();
      document.fonts?.removeEventListener("loadingdone", schedule);
      stop();
    };
  }, []);
  return (
    <header className={styles.header} ref={header}>
      <AccessWarning />
      <div className={styles.bar} ref={bar}>
        <Link to="/" className={styles.brand}>
          <img src="/icon.svg" alt="" width="28" height="28" />
          <span data-shed-label="brand">embed-dash</span>
        </Link>
        <nav aria-label="Main" className={styles.views}>
          <Segmented activeKey={view}>
            {views
              .filter((item) => !editing || item.view !== "send")
              .map((item) => (
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
            <span data-shed-label="shortcuts">Shortcuts</span>
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
