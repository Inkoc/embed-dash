import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  canPost,
  canSendTo,
  deliveryErrors,
  messagePayloadSchema,
  retryRequestSchema,
  sendRequestSchema,
  validateMessage,
  type DeliveryErrorCode,
  type Guild,
  type GuildChannel,
  type GuildsResponse,
  type Issue,
  type MessagePayload,
  type SendResult,
} from "@embed-dash/shared";
import type { Config } from "./config.js";
import type { MessageFile } from "./discord.js";
import { deliveryFailure, discordFailure } from "./errors.js";
import { discordMessage, searchText } from "./payload.js";
import { sends, sendTargets } from "./schema.js";
import { createUploadStore } from "./uploads.js";

type Discord = {
  listGuilds: () => Promise<GuildsResponse>;
  createMessage: (
    channelId: string,
    body: ReturnType<typeof discordMessage>,
    files: readonly MessageFile[],
  ) => Promise<string>;
};
type TargetRow = typeof sendTargets.$inferSelect;

/** Refusals from one server in a row after which its remaining channels are skipped. */
const maxRefusalsPerServer = 3;

const sendError = (code: string, error: string, extra = {}) => ({
  code,
  error,
  ...extra,
});

/**
 * Sending: the message and one row per channel are stored first, then each
 * channel is posted to in turn through the rate-limited client, so the
 * outcome of every copy is on record whatever happens next.
 */
export async function registerSends(
  app: FastifyInstance,
  config: Config,
  sqlite: Database.Database,
  discord: Discord,
) {
  const db = drizzle(sqlite);
  const store = createUploadStore(config.dataDir, sqlite);

  // A restart cuts a send off mid-way. What was in flight may or may not have
  // been posted, so it is recorded as unknown, which retry never re-sends unseen.
  sqlite.transaction(() => {
    db.update(sendTargets)
      .set({ status: "unknown", error: "UNKNOWN_OUTCOME" })
      .where(eq(sendTargets.status, "pending"))
      .run();
    for (const send of db
      .select({ id: sends.id })
      .from(sends)
      .where(eq(sends.status, "sending"))
      .all())
      finish(send.id);
  })();

  // Delivery runs after the answer has gone out; closing waits for it.
  const running = new Set<Promise<void>>();
  const inBackground = (task: Promise<void>) => {
    running.add(task);
    void task.finally(() => running.delete(task));
  };
  app.addHook("onClose", async () => {
    await Promise.all(running);
  });

  /**
   * The attachments as the server stores them: its record, not the browser's
   * claim, decides names and sizes. Files the server no longer has are
   * reported by id; the rest are read for sending.
   */
  function loadAttachments(payload: MessagePayload) {
    const missing = new Set<string>();
    const files: MessageFile[] = [];
    const attachments = payload.attachments.map((draft) => {
      const row = store.present(draft.id);
      if (!row) {
        missing.add(draft.id);
        return draft;
      }
      try {
        files.push({
          name: row.filename,
          data: readFileSync(join(store.directory, row.id)),
        });
      } catch {
        missing.add(draft.id);
      }
      return {
        id: row.id,
        filename: row.filename,
        size: row.size,
        contentType: row.contentType,
      };
    });
    return { payload: { ...payload, attachments }, files, missing };
  }

  /** The 422 for a message Discord would refuse, or null when it can go. */
  function refusal(
    reply: FastifyReply,
    payload: MessagePayload,
    missing: ReadonlySet<string>,
  ) {
    const issues: Issue[] = validateMessage(payload, { missingFiles: missing });
    if (issues.length === 0) return null;
    return reply
      .code(422)
      .send(
        sendError(
          missing.size > 0 ? "UPLOAD_MISSING" : "INVALID_MESSAGE",
          missing.size > 0
            ? "A file in this message is no longer on the server. Nothing was sent."
            : "The message breaks a Discord limit. Nothing was sent.",
          { issues, missingFiles: [...missing] },
        ),
      );
  }

  const readSend = (id: string): SendResult => {
    const send = db.select().from(sends).where(eq(sends.id, id)).get()!;
    const targets = db
      .select()
      .from(sendTargets)
      .where(eq(sendTargets.sendId, id))
      .orderBy(asc(sendTargets.position))
      .all();
    return {
      id,
      status: send.status as SendResult["status"],
      targets: targets.map((target) => ({
        id: target.id,
        guildId: target.guildId,
        guildName: target.guildName,
        channelId: target.channelId,
        channelName: target.channelName,
        status: target.status,
        messageId: target.messageId,
        error: target.error
          ? {
              code: target.error as DeliveryErrorCode,
              message: deliveryErrors[target.error as DeliveryErrorCode],
            }
          : null,
      })),
    };
  };

  function listed(listing: GuildsResponse) {
    const byId = new Map<string, { guild: Guild; channel: GuildChannel }>();
    for (const guild of listing.guilds)
      for (const channel of guild.channels)
        byId.set(channel.id, { guild, channel });
    return byId;
  }

  /** The send's status from what its targets ended up as. */
  function finish(sendId: string) {
    const all = db
      .select({ status: sendTargets.status })
      .from(sendTargets)
      .where(eq(sendTargets.sendId, sendId))
      .all();
    const sent = all.filter((target) => target.status === "sent").length;
    db.update(sends)
      .set({
        status: sent === all.length ? "done" : sent > 0 ? "partial" : "failed",
        updatedAt: Date.now(),
      })
      .where(eq(sends.id, sendId))
      .run();
  }

  /**
   * Posts to the given targets in order and records each outcome as it
   * arrives. A refused token ends the run, since the rest would be refused too,
   * and so do repeated refusals from one server for the rest of its channels.
   */
  async function deliver(
    sendId: string,
    targets: readonly TargetRow[],
    payload: MessagePayload,
    files: readonly MessageFile[],
    sentAt: Date,
    listing: GuildsResponse,
  ) {
    const channels = listed(listing);
    const body = discordMessage(payload, sentAt);
    const record = (
      target: TargetRow,
      change: Partial<typeof sendTargets.$inferInsert>,
    ) =>
      db
        .update(sendTargets)
        .set({ ...change, attemptedAt: Date.now() })
        .where(eq(sendTargets.id, target.id))
        .run();
    let stopped = false;
    const refusals = new Map<string, number>();
    for (const target of targets) {
      if (stopped) {
        record(target, { status: "failed", error: "NOT_ATTEMPTED" });
        continue;
      }
      if ((refusals.get(target.guildId) ?? 0) >= maxRefusalsPerServer) {
        record(target, { status: "failed", error: "SERVER_REFUSING" });
        continue;
      }
      // The listing is the one fetched when the send began (cached for up to a
      // minute), so this catches channels that changed since the operator
      // looked, not changes within the last minute; Discord has the last word.
      const current = channels.get(target.channelId)?.channel;
      if (!current || !canSendTo(current)) {
        record(target, {
          status: "failed",
          error: !current
            ? "CHANNEL_GONE"
            : current.kind === "forum"
              ? "FORUM_CHANNEL"
              : "MISSING_PERMISSION",
        });
        continue;
      }
      try {
        const messageId = await discord.createMessage(
          target.channelId,
          body,
          files,
        );
        record(target, { status: "sent", messageId, error: null });
        refusals.delete(target.guildId);
      } catch (error) {
        const failure = deliveryFailure(error);
        app.log.warn(
          { code: failure.code, channelId: target.channelId },
          "Delivery failed",
        );
        record(target, { status: failure.outcome, error: failure.code });
        stopped = failure.stop;
        if (
          failure.code === "MISSING_PERMISSION" ||
          failure.code === "CHANNEL_GONE"
        )
          refusals.set(target.guildId, (refusals.get(target.guildId) ?? 0) + 1);
        else refusals.delete(target.guildId);
      }
    }
    finish(sendId);
  }

  /** Runs delivery in the background; whatever it didn't get to is recorded as unknown. */
  function deliverInBackground(...args: Parameters<typeof deliver>) {
    inBackground(
      deliver(...args).catch((error: unknown) => {
        app.log.error(
          { err: error instanceof Error ? error.name : "unknown" },
          "Delivery stopped unexpectedly",
        );
        db.update(sendTargets)
          .set({ status: "unknown", error: "UNKNOWN_OUTCOME" })
          .where(
            and(
              eq(sendTargets.sendId, args[0]),
              eq(sendTargets.status, "pending"),
            ),
          )
          .run();
        finish(args[0]);
      }),
    );
  }

  const listingFailed = (reply: FastifyReply, error: unknown) => {
    const { code, message, statusCode, ...details } = discordFailure(error);
    app.log.warn({ code, ...details }, "Discord guild listing failed");
    return reply.code(statusCode).send({ code, error: message });
  };

  app.post("/api/sends", async (request, reply) => {
    const parsed = sendRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send(sendError("INVALID_REQUEST", "The send request is malformed."));
    const { id: sendId, channelIds } = parsed.data;
    // The same id again means the first answer was lost: hand back that send.
    if (db.select().from(sends).where(eq(sends.id, sendId)).get())
      return reply.code(202).send({ id: sendId });
    const { payload, files, missing } = loadAttachments(parsed.data.payload);
    const refused = refusal(reply, payload, missing);
    if (refused) return refused;

    let listing: GuildsResponse;
    try {
      listing = await discord.listGuilds();
    } catch (error) {
      return listingFailed(reply, error);
    }
    const channels = listed(listing);
    const unavailable: {
      id: string;
      reason: "gone" | "forum" | "permission";
    }[] = [];
    for (const id of channelIds) {
      const found = channels.get(id)?.channel;
      if (!found) unavailable.push({ id, reason: "gone" });
      else if (found.kind === "forum")
        unavailable.push({ id, reason: "forum" });
      else if (!canPost(found)) unavailable.push({ id, reason: "permission" });
    }
    if (unavailable.length > 0)
      return reply
        .code(409)
        .send(
          sendError(
            "CHANNELS_UNAVAILABLE",
            "Some channels can’t be posted to right now. Nothing was sent.",
            { channels: unavailable },
          ),
        );

    const now = Date.now();
    sqlite.transaction(() => {
      db.insert(sends)
        .values({
          id: sendId,
          payloadJson: JSON.stringify(payload),
          searchText: searchText(payload),
          status: "sending",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(sendTargets)
        .values(
          channelIds.map((id, position) => {
            const { guild, channel } = channels.get(id)!;
            return {
              id: randomUUID(),
              sendId,
              guildId: guild.id,
              guildName: guild.name,
              channelId: id,
              channelName: channel.name,
              status: "pending" as const,
              position,
            };
          }),
        )
        .run();
    })();
    const targets = db
      .select()
      .from(sendTargets)
      .where(eq(sendTargets.sendId, sendId))
      .orderBy(asc(sendTargets.position))
      .all();
    deliverInBackground(
      sendId,
      targets,
      payload,
      files,
      new Date(now),
      listing,
    );
    return reply.code(202).send({ id: sendId });
  });

  const idParams = {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", format: "uuid" } },
      },
    },
  };

  app.get("/api/sends/:id", idParams, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!db.select().from(sends).where(eq(sends.id, id)).get())
      return reply
        .code(404)
        .send(sendError("NOT_FOUND", "That send doesn’t exist."));
    return readSend(id);
  });

  app.post("/api/sends/:id/retry", idParams, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = retryRequestSchema.safeParse(request.body ?? {});
    if (!body.success)
      return reply
        .code(400)
        .send(sendError("INVALID_REQUEST", "The retry request is malformed."));
    const send = db.select().from(sends).where(eq(sends.id, id)).get();
    if (!send)
      return reply
        .code(404)
        .send(sendError("NOT_FOUND", "That send doesn’t exist."));

    const { payload, files, missing } = loadAttachments(
      messagePayloadSchema.parse(JSON.parse(send.payloadJson)),
    );
    const refused = refusal(reply, payload, missing);
    if (refused) return refused;
    let listing: GuildsResponse;
    try {
      listing = await discord.listGuilds();
    } catch (error) {
      return listingFailed(reply, error);
    }
    if (send.status === "sending")
      return reply
        .code(409)
        .send(
          sendError(
            "SEND_IN_PROGRESS",
            "This send is still being delivered. Wait for it to finish.",
          ),
        );

    // Claiming and attempting are one step, so two retries can't both post a copy.
    const claimed = sqlite.transaction(() => {
      const failed = db
        .select()
        .from(sendTargets)
        .where(
          and(
            eq(sendTargets.sendId, id),
            eq(sendTargets.status, "failed"),
            body.data.targetIds
              ? inArray(sendTargets.id, body.data.targetIds)
              : undefined,
          ),
        )
        .orderBy(asc(sendTargets.position))
        .all();
      if (failed.length === 0) return failed;
      db.update(sendTargets)
        .set({ status: "pending", error: null })
        .where(
          inArray(
            sendTargets.id,
            failed.map((target) => target.id),
          ),
        )
        .run();
      db.update(sends)
        .set({ status: "sending", updatedAt: Date.now() })
        .where(eq(sends.id, id))
        .run();
      return failed;
    })();
    if (claimed.length === 0)
      return reply
        .code(409)
        .send(
          sendError(
            "NOTHING_TO_RETRY",
            "There are no failed channels to retry.",
          ),
        );
    deliverInBackground(
      id,
      claimed,
      payload,
      files,
      new Date(send.createdAt),
      listing,
    );
    return reply.code(202).send({ id });
  });
}
