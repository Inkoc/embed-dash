// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { SchedulePicker, scheduleInstant, localInput } from "./SchedulePicker";
afterEach(cleanup);
test("names the browser zone and rejects past or empty times on blur", () => {
  render(<SchedulePicker value="2000-01-01T12:00" onChange={() => {}} />);
  const input = screen.getByLabelText(/Send date and time/);
  expect(
    screen.getByText(
      new RegExp(Intl.DateTimeFormat().resolvedOptions().timeZone),
    ),
  ).toBeTruthy();
  fireEvent.blur(input);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText(/That time has passed/)).toBeTruthy();
  expect(scheduleInstant("")).toBeNull();
  expect(scheduleInstant("2000-01-01T12:00")).toBeNull();
  const future = Date.now() + 3600000;
  expect(scheduleInstant(localInput(future))).toBeGreaterThan(Date.now());
});
