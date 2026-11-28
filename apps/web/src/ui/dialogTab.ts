import type { KeyboardEvent } from "react";

const focusable =
  "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";

/**
 * Keeps Tab inside an open dialog: a modal dialog already makes the page
 * behind it inert, but Tab past its last control would leave for the
 * browser's own toolbar, so it wraps to the first control instead (and
 * Shift+Tab from the first to the last).
 */
export function keepTabInside(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey)
    return;
  const controls = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(focusable),
  ].filter((element) => !element.closest("[hidden], [inert]"));
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  const leaving = event.shiftKey
    ? active === first || !event.currentTarget.contains(active)
    : active === last;
  if (!leaving) return;
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
}
