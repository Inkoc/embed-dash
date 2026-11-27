/** Key caps carry data-k; pressing a shortcut presses every cap printed for it. */
export type KeyName = "forward" | "back" | "search" | "help";

export const isApplePlatform = () =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

export function pressKey(name: KeyName) {
  for (const cap of document.querySelectorAll<HTMLElement>(
    `kbd[data-k="${name}"]`,
  )) {
    cap.dataset.pressed = "";
    setTimeout(() => delete cap.dataset.pressed, 160);
  }
}

/** Typing targets keep printable keys such as / and ? for themselves. */
export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement)
    return true;
  return (
    target instanceof HTMLInputElement &&
    !["checkbox", "radio", "button", "submit", "color", "range"].includes(
      target.type,
    )
  );
}

export type ShortcutAction = "forward" | "back" | "search" | "help" | null;

/**
 * Maps a key press to an app action. Browser-reserved combinations such as
 * Alt+number are deliberately left alone.
 */
export function shortcutFor(event: KeyboardEvent): ShortcutAction {
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key === "Enter" && !event.altKey) return "forward";
  if (event.key === "Escape" && !modifier && !event.altKey) return "back";
  if (modifier || event.altKey || isTypingTarget(event.target)) return null;
  if (event.key === "/") return "search";
  if (event.key === "?") return "help";
  return null;
}
