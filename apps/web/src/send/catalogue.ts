import {
  canSendTo,
  channelPermissions,
  type Guild,
  type GuildChannel,
} from "@embed-dash/shared";

/** Half-open [start, end) character ranges to mark as search hits. */
export type Ranges = readonly (readonly [number, number])[];

/** Lowercased terms; a leading # is how people write channel names, so it is dropped. */
export function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^#+/, ""))
    .filter(Boolean);
}

/** Every occurrence of every term in the text, merged where they overlap. */
export function findRanges(text: string, terms: readonly string[]): Ranges {
  const lower = text.toLowerCase();
  const found: [number, number][] = [];
  for (const term of terms)
    for (
      let at = lower.indexOf(term);
      at >= 0;
      at = lower.indexOf(term, at + 1)
    )
      found.push([at, at + term.length]);
  found.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of found) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

export interface ChannelHit {
  channel: GuildChannel;
  name: Ranges;
  id: Ranges;
}
export interface DrawerHit {
  guild: Guild;
  name: Ranges;
  id: Ranges;
  channels: ChannelHit[];
}

/**
 * Every term has to appear in the channel's name or ID or its server's name or
 * ID, so "news cup" finds #news in the Cup servers. A server is listed when at
 * least one of its channels matches; with no terms every server is listed.
 */
export function searchCatalogue(
  guilds: readonly Guild[],
  query: string,
): DrawerHit[] {
  const terms = searchTerms(query);
  const inText = (term: string, ...texts: string[]) =>
    texts.some((text) => text.toLowerCase().includes(term));
  return guilds.flatMap((guild) => {
    const channels = guild.channels
      .filter((channel) =>
        terms.every((term) =>
          inText(term, channel.name, channel.id, guild.name, guild.id),
        ),
      )
      .map((channel) => ({
        channel,
        name: findRanges(channel.name, terms),
        id: findRanges(channel.id, terms),
      }));
    if (terms.length && !channels.length) return [];
    return [
      {
        guild,
        name: findRanges(guild.name, terms),
        id: findRanges(guild.id, terms),
        channels,
      },
    ];
  });
}

export interface Segment {
  text: string;
  mark: boolean;
  strong: boolean;
}

/** Splits text into runs that are marked, strong (from `strongFrom` on), both or neither. */
export function segments(
  text: string,
  ranges: Ranges,
  strongFrom = text.length,
): Segment[] {
  const cuts = new Set([0, text.length, strongFrom]);
  for (const [start, end] of ranges) cuts.add(start).add(end);
  const points = [...cuts]
    .filter((n) => n >= 0 && n <= text.length)
    .sort((a, b) => a - b);
  const result: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [start, end] = [points[i], points[i + 1]];
    if (start === end) continue;
    result.push({
      text: text.slice(start, end),
      mark: ranges.some(([a, b]) => start >= a && end <= b),
      strong: start >= strongFrom,
    });
  }
  return result;
}

/** Call numbers: the last six digits tell two same-named channels apart, so they lead. */
export const callNumberStrongFrom = (id: string) => Math.max(0, id.length - 6);

/** The drawer label holder's initials: first letters of the first two words. */
export function initials(name: string): string {
  const [first = "?", second] = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const head = (word: string, n: number) => [...word].slice(0, n).join("");
  const letters = second ? head(first, 1) + head(second, 1) : head(first, 2);
  return letters.toUpperCase();
}

export const kindLabel: Record<GuildChannel["kind"], string> = {
  text: "Text",
  announcement: "Announcement",
  forum: "Forum (new post)",
};

/** Why the bot can't post in a channel, or null when it can. */
export function blockedReason(channel: GuildChannel): string | null {
  if (canSendTo(channel)) return null;
  // Forum posts are new threads, which sending doesn't do yet.
  if (
    channel.kind === "forum" &&
    !channelPermissions.some(
      (p) => p.required && channel.missing.includes(p.key),
    )
  )
    return "Forum posting isn’t available yet";
  const labels = channelPermissions
    .filter((p) => p.required && channel.missing.includes(p.key))
    .map((p) => p.label);
  return `Bot is missing ${labels.join(" and ")} here`;
}
