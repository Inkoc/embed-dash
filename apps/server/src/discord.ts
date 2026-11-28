import { REST } from "@discordjs/rest";
import {
  ChannelType,
  Routes,
  type RESTAPIPartialCurrentUserGuild,
  type RESTGetAPICurrentUserResult,
  type RESTGetAPIGuildChannelsResult,
  type RESTGetAPIGuildMemberResult,
  type RESTGetAPIGuildResult,
  type RESTPostAPIChannelMessageJSONBody,
  type RESTPatchAPIChannelMessageJSONBody,
  type RESTPostAPIChannelMessageResult,
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
import { safeErrorDetails } from "./errors.js";
import { missingPermissions } from "./permissions.js";

/** Discord's maximum page size for the current user's guilds. */
const maxGuildPageSize = 200;
const cacheMs = 60_000;
/** Guilds fetched at once; the REST client still queues per rate-limit bucket. */
const guildConcurrency = 4;
/** A rate limit longer than this fails that channel instead of holding the whole send. */
const maxRateLimitWaitMs = 30_000;
/** Rate-limit pauses one post may sit through before it is given up on. */
const maxRateLimitReplays = 3;
/** Uploads of up to 25 MB share this budget. */
const postTimeoutMs = 60_000;

export interface DiscordMessage {
  id: string;
  attachments: { id: string; filename: string }[];
}

export interface StoredAttachment {
  uploadId: string;
  id: string;
  filename: string;
}

export interface MessageFile {
  name: string;
  data: Buffer;
}

const kinds: Partial<Record<ChannelType, ChannelKind>> = {
  [ChannelType.GuildText]: "text",
  [ChannelType.GuildAnnouncement]: "announcement",
  [ChannelType.GuildForum]: "forum",
};

export function createDiscord(
  config: Config,
  // Tests page through a handful of guilds instead of hundreds of rate-limited calls.
  { guildPageSize = maxGuildPageSize } = {},
): {
  editMessage: (
    channelId: string,
    messageId: string,
    body: RESTPostAPIChannelMessageJSONBody,
    files: readonly MessageFile[],
    retained: readonly { id: string; filename: string }[],
  ) => Promise<DiscordMessage>;
  getBot: () => Promise<BotIdentity>;
  listGuilds: (options?: { refresh?: boolean }) => Promise<GuildsResponse>;
  /** Posts a message, with files as multipart `files[n]` beside `payload_json`; resolves to its ID. */
  createMessage: (
    channelId: string,
    body: RESTPostAPIChannelMessageJSONBody,
    files: readonly MessageFile[],
  ) => Promise<DiscordMessage>;
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
  // Rate-limit waits spent by the post now running in a channel, and the post
  // queued behind it. Two sends can aim at one channel; their posts take turns
  // so that each starts counting from zero.
  const rateLimitPauses = new Map<string, number>();
  const channelTurns = new Map<string, Promise<unknown>>();
  // Posting waits out short rate limits. It never retries by itself: repeating
  // a post that timed out could put the message in the channel twice.
  const posting = new REST({
    api: config.discordApiBase,
    version: "10",
    retries: 0,
    rejectOnRateLimit: (limit) => {
      if (limit.retryAfter > maxRateLimitWaitMs) return true;
      // The major parameter of a message post is its channel, and one post per channel runs at a time (see createMessage).
      const pauses = (rateLimitPauses.get(limit.majorParameter) ?? 0) + 1;
      rateLimitPauses.set(limit.majorParameter, pauses);
      return pauses > maxRateLimitReplays;
    },
    timeout: postTimeoutMs,
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
    const guilds: (Guild | undefined)[] = new Array(partials.length);
    // Filled by index so both lists keep Discord's order whatever finishes first.
    const unavailable: (GuildsResponse["unavailable"][number] | undefined)[] =
      new Array(partials.length);
    let next = 0;
    let failed = false;
    const worker = async () => {
      // After a fatal failure the listing is lost, so the others stop spending rate limit on it.
      while (!failed && next < partials.length) {
        const index = next++;
        const partial = partials[index];
        try {
          guilds[index] = await fetchGuild(api, partial.id, bot.id);
        } catch (error) {
          // The bot was removed or lost access mid-listing: list the rest.
          const { status } = safeErrorDetails(error);
          if (status === 403 || status === 404)
            unavailable[index] = { id: partial.id, name: partial.name };
          else {
            failed = true;
            throw error;
          }
        }
      }
    };
    await Promise.all(Array.from({ length: guildConcurrency }, worker));
    return {
      guilds: guilds.filter((guild) => guild !== undefined),
      unavailable: unavailable.filter((entry) => entry !== undefined),
      fetchedAt: new Date().toISOString(),
    };
  }

  // One listing at a time, shared by every caller, refresh or not. The cached
  // result is kept when a refresh fails and expires a minute after it arrived.
  let cached: { at: number; value: GuildsResponse } | undefined;
  let inFlight: Promise<GuildsResponse> | undefined;
  function listGuilds({ refresh = false } = {}) {
    // A fresh list answers a plain read even while a refresh runs, so that
    // read can't inherit the refresh's failure.
    if (cached && !refresh && Date.now() - cached.at <= cacheMs)
      return Promise.resolve(cached.value);
    if (inFlight) return inFlight;
    inFlight = fetchGuilds()
      .then((value) => {
        cached = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  async function post(
    channelId: string,
    body: RESTPostAPIChannelMessageJSONBody,
    files: readonly MessageFile[],
  ) {
    rateLimitPauses.delete(channelId);
    try {
      const message = (await client(posting).post(
        Routes.channelMessages(channelId),
        { body, files: files.map((file) => ({ ...file })) },
      )) as RESTPostAPIChannelMessageResult;
      return {
        id: message.id,
        attachments: message.attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
        })),
      };
    } finally {
      rateLimitPauses.delete(channelId);
    }
  }

  function createMessage(
    channelId: string,
    body: RESTPostAPIChannelMessageJSONBody,
    files: readonly MessageFile[],
  ) {
    const turn = (channelTurns.get(channelId) ?? Promise.resolve()).then(() =>
      post(channelId, body, files),
    );
    const settled = turn.catch(() => undefined);
    channelTurns.set(channelId, settled);
    void settled.then(() => {
      if (channelTurns.get(channelId) === settled)
        channelTurns.delete(channelId);
    });
    return turn;
  }

  function editMessage(
    channelId: string,
    messageId: string,
    body: RESTPostAPIChannelMessageJSONBody,
    files: readonly MessageFile[],
    retained: readonly { id: string; filename: string }[],
  ) {
    const turn = (channelTurns.get(channelId) ?? Promise.resolve()).then(
      async () => {
        rateLimitPauses.delete(channelId);
        try {
          const route = Routes.channelMessage(channelId, messageId);
          const api = client(posting);
          const edit: RESTPatchAPIChannelMessageJSONBody = {
            content: body.content ?? "",
            embeds: body.embeds ?? [],
            components: body.components ?? [],
            allowed_mentions: body.allowed_mentions,
            attachments: [
              ...retained.map((a) => ({ id: a.id, filename: a.filename })),
              ...files.map((f, id) => ({ id, filename: f.name })),
            ],
          };
          const result = (await api.patch(route, {
            body: edit,
            files: files.map((f) => ({ ...f })),
          })) as RESTPostAPIChannelMessageResult;
          return {
            id: result.id,
            attachments: result.attachments.map((a) => ({
              id: a.id,
              filename: a.filename,
            })),
          };
        } finally {
          rateLimitPauses.delete(channelId);
        }
      },
    );
    const settled = turn.catch(() => undefined);
    channelTurns.set(channelId, settled);
    void settled.then(() => {
      if (channelTurns.get(channelId) === settled)
        channelTurns.delete(channelId);
    });
    return turn;
  }
  return { getBot, listGuilds, createMessage, editMessage };
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
