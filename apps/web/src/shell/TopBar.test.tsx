// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../App";

let frames: FrameRequestCallback[] = [];
const observers: (() => void)[] = [];
const queries: string[] = [];

/** Runs the frames queued so far, as the browser would on its next frame. */
const nextFrame = () =>
  act(() => {
    const due = frames;
    frames = [];
    for (const frame of due) frame(0);
  });
// Each fit asks about the brand breakpoint once.
const fits = () => queries.filter((q) => q === "(max-width: 719.98px)").length;

beforeEach(() => {
  frames = [];
  observers.length = 0;
  queries.length = 0;
  localStorage.clear();
  vi.stubGlobal("matchMedia", (query: string) => {
    queries.push(query);
    return {
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });
  vi.stubGlobal("scrollTo", () => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ id: "1", name: "Test bot", avatarUrl: null }),
    ),
  );
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
    frames.push(frame);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    // A cancelled frame is dropped from the queue without running.
    if (frames[id - 1]) frames[id - 1] = () => {};
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "fonts");
});

function renderApp() {
  const client = new QueryClient();
  client.setQueryDefaults(["session"], { staleTime: Infinity });
  client.setQueryData(["session"], {
    authenticated: true,
    insecure: false,
    csrfToken: "fixture",
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("the bar is fitted before the first paint, and observer reports in one frame share one refit", async () => {
  renderApp();
  expect(fits()).toBe(1);
  // The bot's name arriving changes the bar too; let that settle first.
  await screen.findAllByText("Test bot");
  await nextFrame();
  await nextFrame();
  const before = fits();
  for (let i = 0; i < 3; i++) for (const report of observers) report();
  expect(fits()).toBe(before);
  await nextFrame();
  expect(fits()).toBe(before + 1);
  await nextFrame();
  expect(fits()).toBe(before + 1);
});

test("a font load that finishes after the bar has gone writes nothing", async () => {
  let fontsReady!: () => void;
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      ready: new Promise<void>((done) => (fontsReady = done)),
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  const { unmount } = renderApp();
  const style = document.documentElement.style;
  expect(style.getPropertyValue("--bar-height")).not.toBe("");
  unmount();
  expect(style.getPropertyValue("--bar-height")).toBe("");
  const before = fits();
  await act(async () => fontsReady());
  await nextFrame();
  expect(fits()).toBe(before);
  expect(style.getPropertyValue("--bar-height")).toBe("");
});
