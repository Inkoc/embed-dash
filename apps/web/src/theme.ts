import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

export type Theme = "light" | "dark";
/** Also read by the pre-paint script in index.html. */
export const themeStorageKey = "embed-dash:theme";

const root = () => document.documentElement;
const systemTheme = (): Theme =>
  matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
export const prefersReducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(themeStorageKey);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/** The theme index.html applied before first paint, or the same rule if it didn't run. */
function initialTheme(): Theme {
  const applied = root().dataset.theme;
  if (applied === "light" || applied === "dark") return applied;
  const theme = storedTheme() ?? systemTheme();
  root().dataset.theme = theme;
  return theme;
}

function swap(apply: () => void, animate: boolean) {
  if (!animate || prefersReducedMotion()) return apply();
  if (!document.startViewTransition) {
    root().classList.add("theme-fade");
    apply();
    setTimeout(() => root().classList.remove("theme-fade"), 260);
    return;
  }
  root().classList.add("theme-wipe");
  const transition = document.startViewTransition(apply);
  // The page stays usable during the wipe: any press finishes it at once, and
  // a click that the transition's overlay caught is passed on to the element
  // under the pointer.
  const skip = () => transition.skipTransition();
  const skipAndForward = () => {
    skip();
    addEventListener("click", forwardClick, { capture: true, once: true });
  };
  addEventListener("pointerdown", skipAndForward, { capture: true });
  addEventListener("keydown", skip, { capture: true });
  void transition.finished.finally(() => {
    root().classList.remove("theme-wipe");
    removeEventListener("pointerdown", skipAndForward, { capture: true });
    removeEventListener("keydown", skip, { capture: true });
  });
}

function forwardClick(event: MouseEvent) {
  if (event.target !== root()) return;
  const target = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>(
      "a, button, label, input, textarea, select, [role], [tabindex]",
    );
  if (!target) return;
  event.stopImmediatePropagation();
  target.focus();
  target.click();
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const apply = useCallback((next: Theme, animate: boolean) => {
    swap(() => {
      root().dataset.theme = next;
      flushSync(() => setTheme(next));
    }, animate);
  }, []);

  // Until the operator chooses, the app keeps following the system setting.
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const follow = (event: MediaQueryListEvent) => {
      if (!storedTheme()) apply(event.matches ? "dark" : "light", true);
    };
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [apply]);

  const toggle = useCallback(() => {
    const next: Theme = root().dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(themeStorageKey, next);
    } catch {
      // Private browsing can refuse storage; the switch still works for this visit.
    }
    apply(next, true);
  }, [apply]);

  return { theme, toggle };
}
