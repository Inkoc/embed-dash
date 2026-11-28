// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { imageCheckDelayMs, useImageFailed } from "./imageCheck";

/** Stands in for the browser's image loader: links containing "broken" fail. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(value: string) {
    setTimeout(() =>
      (value.includes("broken") ? this.onerror : this.onload)?.(),
    );
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("Image", FakeImage);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = () =>
  act(() => vi.advanceTimersByTimeAsync(imageCheckDelayMs + 10));

test("a link that doesn't load is reported once typing pauses", async () => {
  const { result, rerender } = renderHook(
    ({ url }) => useImageFailed(url, []),
    { initialProps: { url: "https://example.com/broken.png" } },
  );
  expect(result.current).toBe(false);
  await settle();
  expect(result.current).toBe(true);
  // Fixing the link clears it as soon as the text changes.
  rerender({ url: "https://example.com/map.png" });
  expect(result.current).toBe(false);
  await settle();
  expect(result.current).toBe(false);
});

test("empty, unaccepted and unattached links are left to validation", async () => {
  for (const url of [
    "",
    "ftp://example.com/broken.png",
    "attachment://broken.png",
  ]) {
    const { result } = renderHook(() => useImageFailed(url, []));
    await settle();
    expect(result.current).toBe(false);
  }
});
