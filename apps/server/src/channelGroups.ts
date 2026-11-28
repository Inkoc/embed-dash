import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  canSendTo,
  channelGroupInputSchema,
  channelGroupNameMax,
  channelGroupUpdateSchema,
  type ChannelGroup,
  type GuildsResponse,
} from "@embed-dash/shared";
import { discordFailure } from "./errors.js";
import { channelGroups } from "./schema.js";

type GroupRow = typeof channelGroups.$inferSelect;

const idParams = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", format: "uuid" } },
    },
  },
};
const notFound = {
  code: "GROUP_NOT_FOUND",
  error: "That channel group no longer exists.",
};
const invalid = (issues: readonly { path: readonly PropertyKey[] }[]) =>
  issues[0]?.path[0] === "name"
    ? {
        code: "INVALID_GROUP_NAME",
        error: `Give the group a name of 1 to ${channelGroupNameMax} characters.`,
      }
    : {
        code: "INVALID_GROUP_CHANNELS",
        error: "A group needs at least one channel, each listed once.",
      };

/**
 * Named sets of channels, shared by everyone who signs in. A group is saved
 * only from channels the bot can post to right now; whether they still can is
 * decided against the listing each time the picker shows the group.
 */
export function registerChannelGroups(
  app: FastifyInstance,
  sqlite: Database.Database,
  discord: { listGuilds: () => Promise<GuildsResponse> },
) {
  const db = drizzle(sqlite);

  const toGroup = (row: GroupRow): ChannelGroup => ({
    id: row.id,
    name: row.name,
    updatedAt: new Date(row.updatedAt).toISOString(),
    channels: JSON.parse(row.channelsJson) as ChannelGroup["channels"],
  });

  /**
   * The channels with the names they have now, or a 409 naming the ones the
   * bot can't post to, so a group never starts out holding a dead entry.
   */
  async function snapshot(channelIds: string[], reply: FastifyReply) {
    let listing: GuildsResponse;
    try {
      listing = await discord.listGuilds();
    } catch (error) {
      const { code, message, statusCode, ...details } = discordFailure(error);
      app.log.warn({ code, ...details }, "Discord guild listing failed");
      reply.code(statusCode).send({ code, error: message });
      return null;
    }
    const byId = new Map(
      listing.guilds.flatMap((guild) =>
        guild.channels.map((channel) => [channel.id, { guild, channel }]),
      ),
    );
    const unavailable = channelIds.filter((id) => {
      const found = byId.get(id);
      return !found || !canSendTo(found.channel);
    });
    if (unavailable.length > 0) {
      reply.code(409).send({
        code: "GROUP_CHANNELS_UNAVAILABLE",
        error: "Some channels can’t be posted to right now.",
        channelIds: unavailable,
      });
      return null;
    }
    return JSON.stringify(
      channelIds.map((id) => {
        const { guild, channel } = byId.get(id)!;
        return {
          id,
          name: channel.name,
          guildId: guild.id,
          guildName: guild.name,
        };
      }),
    );
  }

  // By name as people read it, whatever the case or accents; the browser sorts the same way.
  app.get("/api/channel-groups", async () =>
    db
      .select()
      .from(channelGroups)
      .all()
      .map(toGroup)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
  );

  app.post("/api/channel-groups", async (request, reply) => {
    const parsed = channelGroupInputSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send(invalid(parsed.error.issues));
    const channelsJson = await snapshot(parsed.data.channelIds, reply);
    if (!channelsJson) return reply;
    const row = {
      id: randomUUID(),
      name: parsed.data.name,
      channelsJson,
      updatedAt: Date.now(),
    };
    db.insert(channelGroups).values(row).run();
    return reply.code(201).send(toGroup(row));
  });

  app.patch("/api/channel-groups/:id", idParams, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = channelGroupUpdateSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send(invalid(parsed.error.issues));
    const { name, channelIds } = parsed.data;
    const exists = db
      .select({ id: channelGroups.id })
      .from(channelGroups)
      .where(eq(channelGroups.id, id))
      .get();
    if (!exists) return reply.code(404).send(notFound);
    let channelsJson: string | undefined;
    if (channelIds) {
      const taken = await snapshot(channelIds, reply);
      if (!taken) return reply;
      channelsJson = taken;
    }
    const row = db
      .update(channelGroups)
      .set({ name, channelsJson, updatedAt: Date.now() })
      .where(eq(channelGroups.id, id))
      .returning()
      .get();
    // Deleted by someone else while the listing was awaited.
    return row ? toGroup(row) : reply.code(404).send(notFound);
  });

  app.delete("/api/channel-groups/:id", idParams, async (request, reply) => {
    db.delete(channelGroups)
      .where(eq(channelGroups.id, (request.params as { id: string }).id))
      .run();
    return reply.code(204).send();
  });
}
