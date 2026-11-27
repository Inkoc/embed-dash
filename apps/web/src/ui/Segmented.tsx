import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./Segmented.module.css";

interface Props {
  /** Changes whenever a different item becomes active; the item itself carries data-active. */
  activeKey: string | null;
  children: ReactNode;
  className?: string;
  role?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * A track whose thumb slides under the active item. The thumb is placed
 * without animation first, so it never sweeps in from the edge on load.
 */
export function Segmented({ activeKey, children, className, ...aria }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const trackEl = track.current;
    const thumbEl = thumb.current;
    if (!trackEl || !thumbEl) return;
    const place = () => {
      const active = trackEl.querySelector<HTMLElement>("[data-active]");
      thumbEl.dataset.visible = active ? "true" : "false";
      if (!active) return;
      thumbEl.style.setProperty("--thumb-x", `${active.offsetLeft}px`);
      thumbEl.style.setProperty("--thumb-w", `${active.offsetWidth}px`);
    };
    place();
    requestAnimationFrame(() => (thumbEl.dataset.ready = "true"));
    if (typeof ResizeObserver === "undefined") return;
    // A resize (the bar reflowing onto two rows) moves the thumb with its item
    // at once; only choosing another item slides it. The observer also reports
    // once on observe, which must not cut short a slide that has just started.
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      delete thumbEl.dataset.ready;
      place();
      requestAnimationFrame(() => (thumbEl.dataset.ready = "true"));
    });
    observer.observe(trackEl);
    return () => observer.disconnect();
  }, [activeKey]);

  return (
    <div
      ref={track}
      className={[styles.track, className].filter(Boolean).join(" ")}
      {...aria}
    >
      <span ref={thumb} className={styles.thumb} aria-hidden="true" />
      {children}
    </div>
  );
}

export const segmentedItem = styles.item;
