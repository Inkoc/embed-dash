// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { keepTabInside } from "./dialogTab";

afterEach(cleanup);

function renderDialog() {
  render(
    <>
      <button type="button">Behind</button>
      <div role="dialog" aria-label="Test" onKeyDown={keepTabInside}>
        <button type="button">First</button>
        <button type="button" disabled>
          Off
        </button>
        <div hidden>
          <button type="button">Hidden</button>
        </div>
        <button type="button">Last</button>
      </div>
    </>,
  );
  return {
    first: screen.getByRole("button", { name: "First" }),
    last: screen.getByRole("button", { name: "Last" }),
  };
}

test("Tab from the last control wraps to the first", () => {
  const { first, last } = renderDialog();
  last.focus();
  expect(fireEvent.keyDown(last, { key: "Tab" })).toBe(false);
  expect(first).toHaveFocus();
});

test("Shift+Tab from the first control wraps to the last, skipping disabled and hidden ones", () => {
  const { first, last } = renderDialog();
  first.focus();
  expect(fireEvent.keyDown(first, { key: "Tab", shiftKey: true })).toBe(false);
  expect(last).toHaveFocus();
});

test("Tab between controls inside is left to the browser", () => {
  const { first } = renderDialog();
  first.focus();
  expect(fireEvent.keyDown(first, { key: "Tab" })).toBe(true);
  expect(fireEvent.keyDown(first, { key: "Enter" })).toBe(true);
  expect(first).toHaveFocus();
});
