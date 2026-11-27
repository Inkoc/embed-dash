// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import type { TimestampStyle } from "../compose/markdown";
import { fixtures } from "./fidelity.fixtures";
import { Markdown } from "./Markdown";
import { formatTimestamp } from "./timestamp";

afterEach(cleanup);

const markup = (
  text: string,
  surface: "rich" | "inline" | "plain",
  now?: Date,
) =>
  renderToStaticMarkup(<Markdown text={text} surface={surface} now={now} />)
    .replaceAll(/ class="[^"]*"/g, "")
    // The server renderer hoists image preloads; the client never sees them.
    .replaceAll(/<link rel="preload"[^>]*>/g, "");

describe.each(["rich", "inline", "plain"] as const)("%s surface", (surface) => {
  test.each(fixtures.filter((fixture) => fixture.surface === surface))(
    "$id",
    ({ input, html }) => {
      expect(markup(input, surface)).toBe(html);
    },
  );
});

describe("timestamps", () => {
  const now = new Date("2026-11-27T12:00:00Z");
  const at = 1_700_000_000;
  const date = new Date(at * 1000);
  const styles: TimestampStyle[] = ["t", "T", "d", "D", "f", "F", "R"];

  test.each(styles)("<t:…:%s> renders in the viewer's locale", (style) => {
    expect(markup(`<t:${at}:${style}>`, "rich", now)).toBe(
      `<time dateTime="${date.toISOString()}" title="${formatTimestamp(date, "F", now)}">${formatTimestamp(date, style, now)}</time>`,
    );
  });

  test("no style means short date and time, in titles and field names too", () => {
    expect(markup(`<t:${at}>`, "inline", now)).toContain(
      `>${formatTimestamp(date, "f", now)}</time>`,
    );
  });

  test("a time out of range stays as typed", () => {
    expect(markup("<t:99999999999999999:R>", "rich", now)).toBe(
      "&lt;t:99999999999999999:R&gt;",
    );
  });

  test("each style matches Discord's wording for a known locale", () => {
    const us = (date: Date, style: TimestampStyle, n = now) =>
      formatTimestamp(date, style, n, "en-US");
    const when = new Date(2023, 10, 14, 22, 13, 20);
    expect(us(when, "t")).toBe("10:13 PM");
    expect(us(when, "T")).toBe("10:13:20 PM");
    expect(us(when, "d")).toBe("11/14/2023");
    expect(us(when, "D")).toBe("November 14, 2023");
    expect(us(when, "f")).toBe("November 14, 2023 at 10:13 PM");
    expect(us(when, "F")).toBe("Tuesday, November 14, 2023 at 10:13 PM");
    expect(formatTimestamp(when, "d", now, "de-DE")).toBe("14.11.2023");
  });

  test("relative time picks the largest whole unit", () => {
    const rel = (seconds: number) =>
      formatTimestamp(
        new Date(now.getTime() + seconds * 1000),
        "R",
        now,
        "en-US",
      );
    expect(rel(0)).toBe("now");
    expect(rel(-30)).toBe("30 seconds ago");
    expect(rel(5 * 60)).toBe("in 5 minutes");
    expect(rel(-3 * 3600)).toBe("3 hours ago");
    expect(rel(2 * 86400)).toBe("in 2 days");
    expect(rel(-60 * 86400)).toBe("2 months ago");
    expect(rel(-3 * 365 * 86400)).toBe("3 years ago");
  });
});

test("a spoiler stays hidden until it is clicked", () => {
  render(<Markdown text="||the twist||" surface="rich" />);
  const hidden = screen.getByRole("button", {
    name: "Spoiler, select to show",
  });
  expect(screen.getByText("the twist").closest("[aria-hidden]")).toBeTruthy();
  fireEvent.click(hidden);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("the twist")).toBeTruthy();
});

test("a custom emoji that doesn't load falls back to its name", () => {
  render(<Markdown text="hi <:wave:123456789012345678>" surface="rich" />);
  fireEvent.error(screen.getByRole("img", { name: ":wave:" }));
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText("hi :wave:")).toBeTruthy();
});
