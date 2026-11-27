import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  historyQuerySchema,
  editRequestSchema,
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
import { sends, sendTargets, editRuns } from "./schema.js";
import { createUploadStore } from "./uploads.js";

type Discord = {
  editMessage: (
    channelId: string,
    messageId: string,
    body: ReturnType<typeof discordMessage>,
    files: readonly MessageFile[],
  ) => Promise<string>;
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

  /**
   * Closes the books on a send that was cut off. A copy that was being posted
   * may or may not have arrived, so it is unknown; one never started was
   * certainly not posted, so retry can pick it up.
   */
  const settleInterrupted = (sendId?: string) =>
    sqlite.transaction(() => {
      const scope = (...status: TargetRow["status"][]) =>
        and(
          inArray(sendTargets.status, status),
          sendId ? eq(sendTargets.sendId, sendId) : undefined,
        );
      db.update(sendTargets)
        .set({ status: "unknown", error: "UNKNOWN_OUTCOME" })
        .where(scope("posting"))
        .run();
      db.update(sendTargets)
        .set({ status: "failed", error: "NOT_ATTEMPTED" })
        .where(scope("pending"))
        .run();
      for (const send of db
        .select({ id: sends.id })
        .from(sends)
        .where(
          and(
            eq(sends.status, "sending"),
            sendId ? eq(sends.id, sendId) : undefined,
          ),
        )
        .all())
        finish(send.id);
    })();
  settleInterrupted();

  // Delivery runs after the answer has gone out. Closing lets the post in
  // flight finish, but starts no more: the rest are recorded as not sent.
  const running = new Set<Promise<void>>();
  let closing = false;
  const inBackground = (task: Promise<void>) => {
    running.add(task);
    void task.finally(() => running.delete(task));
  };
  app.addHook("onClose", async () => {
    closing = true;
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

  const readSend = (id: string) => {
    const send = db.select().from(sends).where(eq(sends.id, id)).get()!;
    const targets = db
      .select()
      .from(sendTargets)
      .where(eq(sendTargets.sendId, id))
      .orderBy(asc(sendTargets.position))
      .all();
    return {
      id,
      payload: messagePayloadSchema.parse(JSON.parse(send.payloadJson)),
      createdAt: send.createdAt,
      editId: send.editId,
      lastEditedAt: send.lastEditedAt,
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
    const editing = !!db.select().from(sends).where(eq(sends.id, sendId)).get()
      ?.editId;
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
      if (stopped || closing) {
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
      // Marked before the request goes out, so a crash can tell this copy,
      // which may have arrived, from the ones never tried.
      record(target, { status: "posting" });
      try {
        const messageId = editing
          ? await discord.editMessage(
              target.channelId,
              target.messageId!,
              body,
              files,
            )
          : await discord.createMessage(target.channelId, body, files);
        record(target, { status: "sent", messageId, error: null });
        if (editing)
          db.update(sends)
            .set({ lastEditedAt: Date.now() })
            .where(eq(sends.id, sendId))
            .run();
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

  /** Runs delivery in the background; whatever it didn't get to is settled as after a restart. */
  function deliverInBackground(...args: Parameters<typeof deliver>) {
    inBackground(
      deliver(...args).catch((error: unknown) => {
        app.log.error(
          { err: error instanceof Error ? error.name : "unknown" },
          "Delivery stopped unexpectedly",
        );
        settleInterrupted(args[0]);
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
    // The same id may arrive twice while the listing above is awaited: the
    // second insert finds the row and hands back that send instead of posting.
    const stored = sqlite.transaction(() => {
      const inserted = db
        .insert(sends)
        .values({
          id: sendId,
          payloadJson: JSON.stringify(payload),
          searchText: searchText(payload),
          status: "sending",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run();
      if (inserted.changes === 0) return false;
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
      return true;
    })();
    if (!stored) return reply.code(202).send({ id: sendId });
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

  app.get("/api/sends", async (request, reply) => {
    const parsed = historyQuerySchema.safeParse(request.query);
    if (!parsed.success)
      return reply
        .code(400)
        .send(sendError("INVALID_REQUEST", "The history filters are invalid."));
    const query = parsed.data;
    const conditions = ["s.status IN ('sending', 'done', 'partial', 'failed')"];
    const params: (string | number)[] = [];
    if (query.status) {
      conditions.push("s.status = ?");
      params.push(query.status);
    }
    if (query.from) {
      conditions.push("s.created_at >= ?");
      params.push(Date.parse(query.from));
    }
    if (query.to) {
      conditions.push("s.created_at < ?");
      params.push(Date.parse(query.to) + 86400000);
    }
    if (query.guildId || query.channelId) {
      const targetConditions = ["t.send_id = s.id"];
      if (query.guildId) {
        targetConditions.push("t.guild_id = ?");
        params.push(query.guildId);
      }
      if (query.channelId) {
        targetConditions.push("t.channel_id = ?");
        params.push(query.channelId);
      }
      conditions.push(
        `EXISTS (SELECT 1 FROM send_targets t WHERE ${targetConditions.join(" AND ")})`,
      );
    }
    const term = query.q.toLowerCase().replace(/^#+/, "");
    if (term) {
      // Escape LIKE metacharacters so an operator searches literal message text.
      const pattern = `%${term.replace(/[!%_]/g, "!$&")}%`;
      conditions.push(
        "(fold(s.search_text) LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM send_targets t WHERE t.send_id = s.id AND (fold(t.guild_name) LIKE ? ESCAPE '!' OR fold(t.channel_name) LIKE ? ESCAPE '!' OR fold(t.guild_id) LIKE ? ESCAPE '!' OR fold(t.channel_id) LIKE ? ESCAPE '!')))",
      );
      params.push(pattern, pattern, pattern, pattern, pattern);
    }
    const rows = sqlite
      .prepare(
        `SELECT s.*, (SELECT count(*) FROM send_targets t WHERE t.send_id = s.id) AS channel_count FROM sends s WHERE ${conditions.join(" AND ")} ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, query.limit + 1, (query.page - 1) * query.limit) as {
      id: string;
      payload_json: string;
      created_at: number;
      status: string;
      channel_count: number;
    }[];
    const destinations = sqlite
      .prepare(
        "SELECT DISTINCT t.guild_id AS guildId, t.guild_name AS guildName, t.channel_id AS channelId, t.channel_name AS channelName FROM send_targets t JOIN sends s ON s.id = t.send_id WHERE s.status IN ('sending', 'done', 'partial', 'failed') ORDER BY t.guild_name, t.channel_name",
      )
      .all();
    return {
      entries: rows.slice(0, query.limit).map((row) => {
        const payload = messagePayloadSchema.parse(
          JSON.parse(row.payload_json),
        );
        return {
          id: row.id,
          title:
            payload.embeds.find((embed) => embed.title.trim())?.title ||
            payload.content.split("\n").find((line) => line.trim()) ||
            payload.embeds
              .find((embed) => embed.description.trim())
              ?.description.split("\n")[0] ||
            "Untitled message",
          color: payload.embeds[0]?.color ?? "",
          createdAt: row.created_at,
          channelCount: row.channel_count,
          status: row.status,
        };
      }),
      hasMore: rows.length > query.limit,
      destinations,
    };
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

  app.put("/api/sends/:id", idParams, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = editRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send(sendError("INVALID_REQUEST", "The edit request is malformed."));
    const previous = db
      .select()
      .from(editRuns)
      .where(eq(editRuns.id, parsed.data.id))
      .get();
    if (previous)
      return previous.sendId === id
        ? reply.code(202).send({ id })
        : reply
            .code(409)
            .send(
              sendError(
                "EDIT_CONFLICT",
                "This edit ID belongs to another send.",
              ),
            );
    const send = db.select().from(sends).where(eq(sends.id, id)).get();
    if (!send)
      return reply
        .code(404)
        .send(sendError("NOT_FOUND", "That send doesn’t exist."));
    const original = messagePayloadSchema.parse(JSON.parse(send.payloadJson));
    const { payload, files, missing } = loadAttachments({
      ...parsed.data.payload,
      pings: original.pings,
      silent: original.silent,
    });
    const refused = refusal(reply, payload, missing);
    if (refused) return refused;
    let listing: GuildsResponse;
    try {
      listing = await discord.listGuilds();
    } catch (error) {
      return listingFailed(reply, error);
    }
    const claim = sqlite.transaction(() => {
      if (
        db.select().from(editRuns).where(eq(editRuns.id, parsed.data.id)).get()
      )
        return "duplicate" as const;
      const current = db.select().from(sends).where(eq(sends.id, id)).get()!;
      const targets = db
        .select()
        .from(sendTargets)
        .where(eq(sendTargets.sendId, id))
        .orderBy(asc(sendTargets.position))
        .all();
      if (
        current.status === "sending" ||
        targets.some((t) => t.status === "unknown")
      )
        return "blocked" as const;
      const copies = targets.filter(
        (t) => t.messageId && t.error !== "MESSAGE_DELETED",
      );
      if (!copies.length) return "blocked" as const;
      db.insert(editRuns).values({ id: parsed.data.id, sendId: id }).run();
      db.update(sends)
        .set({
          editId: parsed.data.id,
          payloadJson: JSON.stringify(payload),
          searchText: searchText(payload),
          status: "sending",
          updatedAt: Date.now(),
        })
        .where(eq(sends.id, id))
        .run();
      db.update(sendTargets)
        .set({ status: "pending", error: null })
        .where(
          inArray(
            sendTargets.id,
            copies.map((t) => t.id),
          ),
        )
        .run();
      return copies;
    })();
    if (claim === "blocked")
      return reply
        .code(409)
        .send(
          sendError(
            "EDIT_BLOCKED",
            "Wait for delivery to finish and resolve unconfirmed copies before editing. At least one existing copy is required.",
          ),
        );
    if (claim !== "duplicate")
      deliverInBackground(
        id,
        claim,
        payload,
        files,
        new Date(send.createdAt),
        listing,
      );
    return reply.code(202).send({ id });
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

    if (send.editId && body.data.id) {
      const previous = db
        .select()
        .from(editRuns)
        .where(eq(editRuns.id, body.data.id))
        .get();
      if (previous)
        return previous.sendId === id
          ? reply.code(202).send({ id })
          : reply
              .code(409)
              .send(
                sendError(
                  "EDIT_CONFLICT",
                  "This retry ID belongs to another send.",
                ),
              );
    }
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
    // Claiming and attempting are one step, so two retries can't both post a
    // copy. The send's status is read here, not before the listing was awaited,
    // so a delivery that began meanwhile is seen.
    const claimed = sqlite.transaction(() => {
      const current = db.select().from(sends).where(eq(sends.id, id)).get()!;
      if (
        current.editId &&
        body.data.id &&
        db.select().from(editRuns).where(eq(editRuns.id, body.data.id)).get()
      )
        return "duplicate" as const;
      if (current.status === "sending") return "in-progress" as const;
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
        .all()
        .filter(
          (t) =>
            t.error !== "MESSAGE_DELETED" && (!current.editId || !!t.messageId),
        );
      if (failed.length === 0) return failed;
      if (current.editId && body.data.id)
        db.insert(editRuns).values({ id: body.data.id, sendId: id }).run();
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
    if (claimed === "duplicate") return reply.code(202).send({ id });
    if (claimed === "in-progress")
      return reply
        .code(409)
        .send(
          sendError(
            "SEND_IN_PROGRESS",
            "This send is still being delivered. Wait for it to finish.",
          ),
        );
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
