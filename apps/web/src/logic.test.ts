// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { countLevel } from "./compose/TextControl";
import { previewMax } from "./compose/usePreviewWidth";
import { fieldRows } from "./preview/fieldRows";
import { isTypingTarget, pressKey, shortcutFor } from "./shortcuts";

afterEach(() => vi.useRealTimers());

const field = (name: string, inline: boolean, value = "v") => ({
  id: name,
  name,
  value,
  inline,
});
const layout = (rows: ReturnType<typeof fieldRows>) =>
  rows.map((row) => row.map((p) => `${p.field.name}:${p.start}-${p.end}`));

test("inline fields share rows of three, or two beside a thumbnail", () => {
  const fields = ["a", "b", "c", "d"].map((name) => field(name, true));
  expect(layout(fieldRows(fields, false))).toEqual([
    ["a:1-5", "b:5-9", "c:9-13"],
    ["d:1-13"],
  ]);
  expect(layout(fieldRows(fields, true))).toEqual([
    ["a:1-7", "b:7-13"],
    ["c:1-7", "d:7-13"],
  ]);
});

test("a full-width field breaks the row, and incomplete fields are left out", () => {
  const fields = [
    field("a", true),
    field("wide", false),
    field("b", true),
    field("empty", true, " "),
    field(" ", true),
  ];
  expect(layout(fieldRows(fields, false))).toEqual([
    ["a:1-13"],
    ["wide:1-13"],
    ["b:1-13"],
  ]);
});

test("counts turn near past 90% of a limit and over beyond it", () => {
  expect(countLevel(230, 256)).toBe("ok");
  expect(countLevel(231, 256)).toBe("near");
  expect(countLevel(256, 256)).toBe("near");
  expect(countLevel(257, 256)).toBe("over");
});

function key(init: KeyboardEventInit, target?: EventTarget) {
  const event = new KeyboardEvent("keydown", init);
  if (target) Object.defineProperty(event, "target", { value: target });
  return event;
}

test("shortcuts map to actions and leave browser combinations alone", () => {
  const input = document.createElement("input");
  expect(shortcutFor(key({ key: "Enter", ctrlKey: true }))).toBe("forward");
  expect(shortcutFor(key({ key: "Enter", metaKey: true }, input))).toBe(
    "forward",
  );
  expect(shortcutFor(key({ key: "Enter", ctrlKey: true, altKey: true }))).toBe(
    null,
  );
  expect(shortcutFor(key({ key: "Escape" }, input))).toBe("back");
  expect(shortcutFor(key({ key: "/" }))).toBe("search");
  expect(shortcutFor(key({ key: "?" }))).toBe("help");
  expect(shortcutFor(key({ key: "?" }, input))).toBe(null);
  expect(shortcutFor(key({ key: "1", altKey: true }))).toBe(null);
  expect(shortcutFor(key({ key: "/", ctrlKey: true }))).toBe(null);
  expect(shortcutFor(key({ key: "a" }))).toBe(null);
});

test("only text entry counts as typing", () => {
  const make = (type: string) =>
    Object.assign(document.createElement("input"), { type });
  expect(isTypingTarget(make("text"))).toBe(true);
  expect(isTypingTarget(make("checkbox"))).toBe(false);
  expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
  const editable = document.createElement("div");
  Object.defineProperty(editable, "isContentEditable", { value: true });
  expect(isTypingTarget(editable)).toBe(true);
  expect(isTypingTarget(document.createElement("button"))).toBe(false);
  expect(isTypingTarget(null)).toBe(false);
});

test("pressing a shortcut presses its printed key caps briefly", () => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<kbd data-k="forward"></kbd><kbd data-k="back"></kbd>';
  pressKey("forward");
  const [forward, back] = document.querySelectorAll("kbd");
  expect(forward!.hasAttribute("data-pressed")).toBe(true);
  expect(back!.hasAttribute("data-pressed")).toBe(false);
  vi.advanceTimersByTime(200);
  expect(forward!.hasAttribute("data-pressed")).toBe(false);
});

test("the preview may take the editor's spare width, within its limits", () => {
  expect(previewMax(null, false)).toBe(760);
  // 400 plus the 148 px the editor has above its 352 px minimum
  expect(previewMax({ column: 400, editor: 500 }, false)).toBe(548);
  expect(previewMax({ column: 400, editor: 300 }, false)).toBe(400);
  expect(previewMax({ column: 600, editor: 900 }, false)).toBe(760);
  // stacked, the editor is elsewhere and the column is the limit
  expect(previewMax({ column: 336, editor: 0 }, true)).toBe(336);
  expect(previewMax({ column: 200, editor: 0 }, true)).toBe(320);
});
