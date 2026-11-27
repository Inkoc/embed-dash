import { CornerDownLeft } from "lucide-react";
import { isApplePlatform } from "../shortcuts";

/** Printed beside a control that also has aria-keyshortcuts, so screen readers skip it. */
export function ForwardKeys() {
  return (
    <kbd data-k="forward" aria-hidden="true">
      {isApplePlatform() ? "⌘" : "Ctrl"}
      <CornerDownLeft />
    </kbd>
  );
}

export const forwardShortcut = "Control+Enter Meta+Enter";
