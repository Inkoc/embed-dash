import type { ChannelGroup, GuildsResponse } from "@embed-dash/shared";
import { blockedReason } from "./catalogue";

export interface GroupEntry {
  id: string;
  /** The channel's name now, or the one it had when the group was saved. */
  name: string;
  guildName: string;
  /** Why the group's channel will be skipped, or null when it can be ticked. */
  unavailable: string | null;
}

export interface GroupState {
  entries: GroupEntry[];
  /** The channels selecting the group ticks. */
  available: string[];
}

/** The group's channels checked against the current listing, in the group's order. */
export function groupState(
  group: ChannelGroup,
  listing: GuildsResponse,
): GroupState {
  const guilds = new Map(listing.guilds.map((g) => [g.id, g]));
  const unreadable = new Set(listing.unavailable.map((g) => g.id));
  const entries = group.channels.map((saved): GroupEntry => {
    const guild = guilds.get(saved.guildId);
    const channel = guild?.channels.find((c) => c.id === saved.id);
    if (guild && channel)
      return {
        id: saved.id,
        name: channel.name,
        guildName: guild.name,
        unavailable: blockedReason(channel),
      };
    return {
      id: saved.id,
      name: saved.name,
      guildName: guild?.name ?? saved.guildName,
      unavailable: guild
        ? "Channel no longer exists"
        : unreadable.has(saved.guildId)
          ? "The bot couldn’t read this server"
          : "The bot is no longer in this server",
    };
  });
  return {
    entries,
    available: entries.filter((e) => !e.unavailable).map((e) => e.id),
  };
}
