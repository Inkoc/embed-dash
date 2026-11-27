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
  let i = units.findIndex(([, size]) => Math.abs(seconds) >= size);
  if (i === -1) i = units.length - 1;
  // 59.5 minutes reads as "1 hour" and 364 days as "1 year", not 60 and 12.
  const larger = units[i - 1];
  if (
    larger &&
    Math.abs(Math.round(seconds / units[i]![1])) >=
      Math.round(larger[1] / units[i]![1])
  )
    i--;
  const [unit, size] = units[i]!;
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    Math.round(seconds / size),
    unit,
  );
}
