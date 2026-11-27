import { REST } from "@discordjs/rest";
import {
  ChannelType,
  Routes,
  type RESTAPIPartialCurrentUserGuild,
  type RESTGetAPICurrentUserResult,
  type RESTGetAPIGuildChannelsResult,
  type RESTGetAPIGuildMemberResult,
  type RESTGetAPIGuildResult,
} from "discord-api-types/v10";
import {
  botIdentitySchema,
  mainChannelId,
  type BotIdentity,
  type ChannelKind,
  type Guild,
  type GuildChannel,
  type GuildsResponse,
} from "@embed-dash/shared";
import type { Config } from "./config.js";
import { missingPermissions } from "./permissions.js";

/** Discord's maximum page size for the current user's guilds. */
const guildPageSize = 200;
const cacheMs = 60_000;
/** Guilds fetched at once; the REST client still queues per rate-limit bucket. */
const guildConcurrency = 4;

const kinds: Partial<Record<ChannelType, ChannelKind>> = {
  [ChannelType.GuildText]: "text",
  [ChannelType.GuildAnnouncement]: "announcement",
  [ChannelType.GuildForum]: "forum",
};

export function createDiscord(config: Config): {
  getBot: () => Promise<BotIdentity>;
  listGuilds: (options?: { refresh?: boolean }) => Promise<GuildsResponse>;
} {
  // The bot status answers at once, so a rate limit is reported, not waited out.
  const rest = new REST({
    api: config.discordApiBase,
    version: "10",
    retries: 0,
    rejectOnRateLimit: () => true,
    timeout: 5000,
  });
  // Listing makes several calls per server, so short rate-limit waits are expected.
  const listing = new REST({
    api: config.discordApiBase,
    version: "10",
    retries: 1,
    rejectOnRateLimit: (limit) => limit.retryAfter > 10_000,
    timeout: 5000,
  });
  // The REST client clears its token after a 401; retries still use startup configuration.
  const client = (instance: REST) => instance.setToken(config.botToken);

  async function getBot() {
    const user = (await client(rest).get(
      Routes.user(),
    )) as RESTGetAPICurrentUserResult;
    return botIdentitySchema.parse({
      id: user.id,
      name: user.username,
      avatarUrl: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : null,
    });
  }

  async function fetchGuilds(): Promise<GuildsResponse> {
    const api = client(listing);
    const bot = (await api.get(Routes.user())) as RESTGetAPICurrentUserResult;
    const partials: RESTAPIPartialCurrentUserGuild[] = [];
    for (let after: string | undefined; ;) {
      const query = new URLSearchParams({ limit: String(guildPageSize) });
      if (after) query.set("after", after);
      const page = (await api.get(Routes.userGuilds(), {
        query,
      })) as RESTAPIPartialCurrentUserGuild[];
      partials.push(...page);
      if (page.length < guildPageSize) break;
      after = page.at(-1)!.id;
    }
    const guilds: Guild[] = new Array(partials.length);
    let next = 0;
    const worker = async () => {
      while (next < partials.length) {
        const index = next++;
        guilds[index] = await fetchGuild(api, partials[index].id, bot.id);
      }
    };
    await Promise.all(Array.from({ length: guildConcurrency }, worker));
    return { guilds, fetchedAt: new Date().toISOString() };
  }

  let cache: { at: number; value: Promise<GuildsResponse> } | undefined;
  function listGuilds({ refresh = false } = {}) {
    if (!cache || refresh || Date.now() - cache.at > cacheMs) {
      const value = fetchGuilds();
      const entry = { at: Date.now(), value };
      cache = entry;
      // A failure is reported once and never served from the cache.
      value.catch(() => {
        if (cache === entry) cache = undefined;
      });
    }
    return cache.value;
  }

  return { getBot, listGuilds };
}

async function fetchGuild(
  api: REST,
  guildId: string,
  botId: string,
): Promise<Guild> {
  const [guild, member, channels] = (await Promise.all([
    api.get(Routes.guild(guildId)),
    api.get(Routes.guildMember(guildId, botId)),
    api.get(Routes.guildChannels(guildId)),
  ])) as [
    RESTGetAPIGuildResult,
    RESTGetAPIGuildMemberResult,
    RESTGetAPIGuildChannelsResult,
  ];
  const context = {
    guildId,
    ownerId: guild.owner_id,
    roles: guild.roles,
    member: { userId: botId, roleIds: member.roles },
  };
  const listed: GuildChannel[] = sidebarOrder(
    channels as (Positioned & RESTGetAPIGuildChannelsResult[number])[],
  ).flatMap((channel) => {
    const kind = kinds[channel.type];
    if (!kind) return [];
    return [
      {
        id: channel.id,
        name: channel.name,
        kind,
        missing: missingPermissions(
          context,
          channel.permission_overwrites ?? [],
        ),
      },
    ];
  });
  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.icon
      ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
      : null,
    channels: listed,
    mainChannelId: mainChannelId(listed, guild.system_channel_id),
  };
}

interface Positioned {
  id: string;
  type: ChannelType;
  position?: number;
  parent_id?: string | null;
}

/** Discord's sidebar: uncategorised channels first, then each category's channels. */
export function sidebarOrder<T extends Positioned>(
  channels: readonly T[],
): T[] {
  const byPosition = (a: Positioned, b: Positioned) =>
    (a.position ?? 0) - (b.position ?? 0) ||
    (BigInt(a.id) < BigInt(b.id) ? -1 : 1);
  const categories = channels
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort(byPosition);
  const categoryIds = new Set(categories.map((c) => c.id));
  // A channel whose category is missing is shown with the uncategorised ones.
  const parentOf = (c: Positioned) =>
    c.parent_id && categoryIds.has(c.parent_id) ? c.parent_id : null;
  const children = (parent: string | null) =>
    channels
      .filter((c) => !categoryIds.has(c.id) && parentOf(c) === parent)
      .sort(byPosition);
  return [
    ...children(null),
    ...categories.flatMap((category) => children(category.id)),
  ];
}
