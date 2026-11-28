import type { HistoryDestination } from "@embed-dash/shared";

export const localZone = () =>
  new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")!.value;
export const date = (value: number) =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(value);

/** The next calendar midnight can be 23 or 25 hours away across daylight saving. */
export function localDateBound(value: string, exclusive = false) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day + Number(exclusive)).toISOString();
}
export function historyRequest(params: URLSearchParams) {
  const request = new URLSearchParams(params);
  for (const key of ["from", "to"] as const) {
    const value = params.get(key);
    if (value) request.set(key, localDateBound(value, key === "to"));
  }
  return request;
}

/** Keep matches visible, while limiting long multi-server sends to three copies. */
export function destinationSummary(
  destinations: readonly HistoryDestination[],
  query: string,
) {
  const term = query.toLowerCase().replace(/^#+/, "");
  const ordered = [...destinations].sort(
    (a, b) => Number(matches(b)) - Number(matches(a)),
  );
  function matches(target: HistoryDestination) {
    return (
      term &&
      [
        target.guildName,
        target.channelName,
        target.guildId,
        target.channelId,
      ].some((text) => text.toLowerCase().includes(term))
    );
  }
  const groups = new Map<string, { name: string; channels: string[] }>();
  for (const target of ordered.slice(0, 3)) {
    const group = groups.get(target.guildId) ?? {
      name: target.guildName || target.guildId,
      channels: [],
    };
    group.channels.push(`#${target.channelName || target.channelId}`);
    groups.set(target.guildId, group);
  }
  return (
    [...groups.values()]
      .map((group) => `${group.name}: ${group.channels.join(", ")}`)
      .join(" · ") +
    (destinations.length > 3 ? ` · +${destinations.length - 3} more` : "")
  );
}
