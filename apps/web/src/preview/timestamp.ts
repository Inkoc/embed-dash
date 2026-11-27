import type { TimestampStyle } from "../compose/markdown";

const formats: Record<
  Exclude<TimestampStyle, "R">,
  Intl.DateTimeFormatOptions
> = {
  t: { timeStyle: "short" },
  T: { timeStyle: "medium" },
  d: { year: "numeric", month: "2-digit", day: "2-digit" },
  D: { dateStyle: "long" },
  f: { dateStyle: "long", timeStyle: "short" },
  F: { dateStyle: "full", timeStyle: "short" },
};

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/**
 * A `<t:…>` timestamp the way the reader's Discord shows it: in their own
 * language and time zone, so the preview uses the operator's. Undefined
 * `locale` means the browser's.
 */
export function formatTimestamp(
  date: Date,
  style: TimestampStyle,
  now = new Date(),
  locale?: string,
) {
  if (style !== "R")
    return new Intl.DateTimeFormat(locale, formats[style]).format(date);
  const seconds = (date.getTime() - now.getTime()) / 1000;
  const [unit, size] =
    units.find(([, size]) => Math.abs(seconds) >= size) ?? units.at(-1)!;
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    Math.round(seconds / size),
    unit,
  );
}
