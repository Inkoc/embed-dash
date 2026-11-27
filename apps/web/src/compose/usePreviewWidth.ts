import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

/**
 * Desktop is wide enough for an embed to reach Discord's full 516 px; phone
 * matches a common phone viewport.
 */
export const widthPresets = { desktop: 640, phone: 360 } as const;
export type WidthPreset = keyof typeof widthPresets;
export const minPreviewWidth = 320;
export const maxPreviewWidth = 760;
/** Matches --editor-min (22rem) in tokens.css: the editor never gets narrower. */
const editorMin = 352;
const step = 16;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

interface Measured {
  frame: number;
  column: number;
  editor: number;
}

/** At and below this width the editor and preview stack; keep in step with the CSS. */
export const stackedQuery = "(max-width: 700px)";

/**
 * The widest the preview may be. Side by side it can take whatever the editor
 * has above its minimum; stacked, it can fill its column.
 */
export function previewMax(
  measured: Pick<Measured, "column" | "editor"> | null,
  stacked: boolean,
) {
  const room = !measured?.column
    ? maxPreviewWidth
    : stacked
      ? measured.column
      : measured.column + Math.max(0, measured.editor - editorMin);
  return clamp(room, minPreviewWidth, maxPreviewWidth);
}

export function usePreviewWidth(refs: {
  frame: RefObject<HTMLElement | null>;
  column: RefObject<HTMLElement | null>;
  editor: RefObject<HTMLElement | null>;
}) {
  const [requested, setRequested] = useState<number>(widthPresets.desktop);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const { frame, column, editor } = refs;

  useLayoutEffect(() => {
    const elements = [frame.current, column.current, editor.current];
    if (elements.includes(null) || typeof ResizeObserver === "undefined")
      return;
    const [frameEl, columnEl, editorEl] = elements as HTMLElement[];
    const measure = () =>
      setMeasured({
        frame: frameEl!.offsetWidth,
        column: columnEl!.offsetWidth,
        editor: editorEl!.offsetWidth,
      });
    const observer = new ResizeObserver(measure);
    for (const element of elements) observer.observe(element!);
    return () => observer.disconnect();
  }, [frame, column, editor]);

  const max = previewMax(measured, matchMedia(stackedQuery).matches);
  const actual = measured?.frame || Math.min(requested, max);
  const set = (width: number) =>
    setRequested(clamp(Math.round(width), minPreviewWidth, max));
  const preset = (Object.keys(widthPresets) as WidthPreset[]).find(
    (name) => widthPresets[name] === requested,
  );

  const handle = {
    role: "separator",
    tabIndex: 0,
    "aria-orientation": "vertical" as const,
    "aria-valuenow": actual,
    "aria-valuemin": minPreviewWidth,
    "aria-valuemax": max,
    "aria-valuetext": `Preview ${actual} pixels wide`,
    onKeyDown(event: KeyboardEvent) {
      const amount = event.shiftKey ? step * 4 : step;
      const moves: Record<string, number> = {
        ArrowLeft: actual + amount,
        ArrowRight: actual - amount,
        Home: minPreviewWidth,
        End: max,
      };
      if (!(event.key in moves)) return;
      event.preventDefault();
      set(moves[event.key]!);
    },
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, width: actual };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      // The handle sits on the preview's left edge, so dragging left widens it.
      if (drag.current)
        set(drag.current.width + drag.current.x - event.clientX);
    },
    onPointerUp() {
      drag.current = null;
    },
    onDoubleClick() {
      set(widthPresets.desktop);
    },
  };

  return {
    requested,
    actual,
    preset,
    // A preset stays chosen even where the screen can't fit all of it; the
    // layout gives it what room there is and the readout shows the real width.
    choose: (name: WidthPreset) => setRequested(widthPresets[name]),
    handle,
  };
}
