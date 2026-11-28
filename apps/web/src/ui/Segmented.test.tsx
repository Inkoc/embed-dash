// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Segmented, segmentedItem } from "./Segmented";

let frames: FrameRequestCallback[] = [];
let left = 0;

beforeEach(() => {
  frames = [];
  left = 0;
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
    frames.push(frame);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  // jsdom lays nothing out; the active item reports wherever the test puts it.
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.dataset.active === undefined ? 0 : left;
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(80);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const nextFrame = () =>
  act(() => {
    const due = frames;
    frames = [];
    for (const frame of due) frame(0);
  });

test("without ResizeObserver the thumb measures again after the parent restacks and on resize, without sliding", () => {
  vi.stubGlobal("ResizeObserver", undefined);
  left = 100;
  const { container } = render(
    <Segmented activeKey="b">
      <button className={segmentedItem}>A</button>
      <button className={segmentedItem} data-active>
        B
      </button>
    </Segmented>,
  );
  const thumb = container.querySelector<HTMLElement>("[aria-hidden]")!;
  expect(thumb.style.getPropertyValue("--thumb-x")).toBe("100px");
  // A parent's layout effect (the top bar stacking its views) moves the item.
  left = 4;
  nextFrame();
  expect(thumb.style.getPropertyValue("--thumb-x")).toBe("4px");
  expect(thumb.dataset.ready).toBeUndefined();
  nextFrame();
  expect(thumb.dataset.ready).toBe("true");
  left = 60;
  fireEvent(window, new Event("resize"));
  expect(thumb.style.getPropertyValue("--thumb-x")).toBe("60px");
  expect(thumb.dataset.ready).toBeUndefined();
});
