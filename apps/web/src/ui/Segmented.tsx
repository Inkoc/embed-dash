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
    // Moves the thumb with its item at once; only choosing another item slides it.
    const jump = () => {
      delete thumbEl.dataset.ready;
      place();
      requestAnimationFrame(() => (thumbEl.dataset.ready = "true"));
    };
    // A thumb already under its item stays, so a slide that has just started
    // isn't cut short.
    const follow = () => {
      const active = trackEl.querySelector<HTMLElement>("[data-active]");
      if (
        active &&
        (thumbEl.style.getPropertyValue("--thumb-x") !==
          `${active.offsetLeft}px` ||
          thumbEl.style.getPropertyValue("--thumb-w") !==
            `${active.offsetWidth}px`)
      )
        jump();
    };
    place();
    const frame = requestAnimationFrame(() => {
      thumbEl.dataset.ready = "true";
      // Without an observer, measure again once the parent's layout effects
      // have run: the top bar may stack its views onto a second row before
      // the first paint.
      if (typeof ResizeObserver === "undefined") follow();
    });
    if (typeof ResizeObserver === "undefined") {
      // A resize refits the top bar in the next frame, so the thumb measures
      // in the frame after that, once the items are where they end up.
      let later = 0;
      const resized = () => {
        cancelAnimationFrame(later);
        later = requestAnimationFrame(
          () => (later = requestAnimationFrame(follow)),
        );
      };
      addEventListener("resize", resized);
      return () => {
        cancelAnimationFrame(frame);
        cancelAnimationFrame(later);
        removeEventListener("resize", resized);
      };
    }
    // A resize (the bar reflowing onto two rows, even before first paint)
    // moves the thumb with its item; the observer also reports once on observe.
    const observer = new ResizeObserver(follow);
    observer.observe(trackEl);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
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
