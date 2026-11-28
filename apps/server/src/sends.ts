import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq, inArray, lte, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  historyQuerySchema,
  scheduleEditSchema,
  sendIdSchema,
  editRequestSchema,
  destinationProblem,
  destinationFailure,
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
  type HistoryDestination,
} from "@embed-dash/shared";
import type { Config } from "./config.js";
import type {
  MessageFile,
  DiscordMessage,
  StoredAttachment,
} from "./discord.js";
import { safeErrorDetails, deliveryFailure, discordFailure } from "./errors.js";
import { discordMessage, searchText, messageTitle } from "./payload.js";
import { sends, sendTargets, editRuns } from "./schema.js";
import { createUploadStore } from "./uploads.js";

type Discord = {
  createForum: ReturnType<
    typeof import("./discord.js").createDiscord
  >["createForum"];
  publishMessage: ReturnType<
    typeof import("./discord.js").createDiscord
  >["publishMessage"];
  editMessage: (
    channelId: string,
    messageId: string,
    body: ReturnType<typeof discordMessage>,
    files: readonly MessageFile[],
    retained: readonly { id: string; filename: string }[],
  ) => Promise<DiscordMessage>;
  listGuilds: () => Promise<GuildsResponse>;
  createMessage: (
    channelId: string,
    body: ReturnType<typeof discordMessage>,
    files: readonly MessageFile[],
  ) => Promise<DiscordMessage>;
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
  clock: { now: () => number; intervalMs?: number } = { now: Date.now },
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
          sendId
            ? eq(sendTargets.sendId, sendId)
            : inArray(
                sendTargets.sendId,
                db
                  .select({ id: sends.id })
                  .from(sends)
                  .where(ne(sends.status, "scheduled")),
              ),
        );
      db.update(sendTargets)
        .set({ status: "unknown", error: "UNKNOWN_OUTCOME" })
        .where(scope("posting"))
        .run();
      db.update(sendTargets)
        .set({ status: "failed", error: "NOT_ATTEMPTED" })
        .where(scope("pending"))
        .run();
      db.update(sendTargets)
        .set({ editStatus: "failed", editError: "EDIT_UNCONFIRMED" })
        .where(
          and(
            eq(sendTargets.editStatus, "posting"),
            sendId ? eq(sendTargets.sendId, sendId) : undefined,
          ),
        )
        .run();
      db.update(sendTargets)
        .set({ editStatus: "failed", editError: "EDIT_NOT_ATTEMPTED" })
        .where(
          and(
            eq(sendTargets.editStatus, "pending"),
            sendId ? eq(sendTargets.sendId, sendId) : undefined,
          ),
        )
        .run();
      db.update(sends)
        .set({ editStatus: "done" })
        .where(
          and(
            eq(sends.editStatus, "sending"),
            sendId ? eq(sends.id, sendId) : undefined,
          ),
        )
        .run();
      db.update(sendTargets)
        .set({
          publishStatus: "failed",
          publishError:
            "Publishing was interrupted. Retry publish to confirm it.",
        })
        .where(
          and(
            eq(sendTargets.status, "sent"),
            inArray(sendTargets.publishStatus, ["pending", "publishing"]),
            sendId ? eq(sendTargets.sendId, sendId) : undefined,
          ),
        )
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
  const channelTurns = new Map<string, Promise<void>>();
  let destinations: HistoryDestination[] | undefined;
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
  function loadAttachments(
    payload: MessagePayload,
    retained = new Set<string>(),
  ) {
    const missing = new Set<string>();
    const files: MessageFile[] = [];
    const attachments = payload.attachments.map((draft) => {
      if (retained.has(draft.id)) return draft;
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
    editing = false,
  ) {
    const issues: Issue[] = validateMessage(payload, { missingFiles: missing });
    if (issues.length === 0) return null;
    return reply
      .code(422)
      .send(
        sendError(
          missing.size > 0 ? "UPLOAD_MISSING" : "INVALID_MESSAGE",
          (missing.size > 0
            ? "A file in this message is no longer on the server. "
            : "The message breaks a Discord limit. ") +
            (editing ? "Nothing was changed." : "Nothing was sent."),
          { issues, missingFiles: [...missing] },
        ),
      );
  }

  const storedAttachments = (target: TargetRow): StoredAttachment[] =>
    JSON.parse(target.attachmentsJson ?? "[]") as StoredAttachment[];

  function loadEditAttachments(
    payload: MessagePayload,
    copies: readonly TargetRow[],
  ) {
    const retained = new Set(
      payload.attachments
        .filter((file) =>
          copies.every((copy) =>
            storedAttachments(copy).some((a) => a.uploadId === file.id),
          ),
        )
        .map((file) => file.id),
    );
    return loadAttachments(payload, retained);
  }

  const editErrorMessage = (code: DeliveryErrorCode) =>
    ({
      MISSING_PERMISSION:
        "Discord refused this update. Check the bot’s access, then retry.",
      CHANNEL_GONE:
        "This channel is unavailable. Restore the bot’s access, then retry.",
      RATE_LIMITED:
        "Discord’s rate limit held up this update. Wait a moment, then retry.",
      DISCORD_UNAVAILABLE:
        "Discord had a problem applying this update. Retry to apply the current version.",
      UNREACHABLE:
        "The app couldn’t reach Discord. Check the connection, then retry this update.",
      INVALID_TOKEN:
        "Discord rejected the bot token, so updates stopped. Fix the configured token, restart the app, then retry.",
      INVALID_PAYLOAD:
        "Discord rejected this update. Check the message and its files, then save again.",
      NOT_ATTEMPTED: deliveryErrors.EDIT_NOT_ATTEMPTED,
      SERVER_REFUSING:
        "The server refused several updates. Check the bot’s access, then retry.",
    })[code as "MISSING_PERMISSION"] ?? deliveryErrors[code];

  const readSend = (send: typeof sends.$inferSelect) => {
    const id = send.id;
    const payload = messagePayloadSchema.parse(JSON.parse(send.payloadJson));
    const targets = db
      .select()
      .from(sendTargets)
      .where(eq(sendTargets.sendId, id))
      .orderBy(asc(sendTargets.position))
      .all();
    return {
      id,
      payload,
      createdAt: send.createdAt,
      scheduledAt: send.scheduledAt,
      retainedUploads: payload.attachments
        .filter((file) => {
          const copies = targets.filter(
            (t) => t.messageId && t.editError !== "MESSAGE_DELETED",
          );
          return (
            copies.length > 0 &&
            copies.every((t) =>
              storedAttachments(t).some((a) => a.uploadId === file.id),
            )
          );
        })
        .map((file) => file.id),
      editId: send.editId,
      lastEditedAt: send.lastEditedAt,
      status: send.status as SendResult["status"],
      edit: send.editId
        ? {
            id: send.editId,
            status: send.editStatus ?? "done",
            targets: targets
              .filter((t) => t.editStatus !== null)
              .map((t) => ({
                id: t.id,
                sendId: t.sendId,
                channelKind: t.channelKind,
                ...forumDetails(payload, t),
                publishStatus: t.publishStatus,
                publishError: t.publishError,
                guildId: t.guildId,
                guildName: t.guildName,
                channelId: t.channelId,
                channelName: t.channelName,
                messageId: t.messageId,
                status: t.editStatus,
                error: t.editError
                  ? {
                      code: t.editError,
                      message: editErrorMessage(
                        t.editError as DeliveryErrorCode,
                      ),
                    }
                  : null,
              })),
          }
        : null,
      targets: targets.map((target) => ({
        id: target.id,
        sendId: target.sendId,
        guildId: target.guildId,
        guildName: target.guildName,
        channelId: target.channelId,
        channelName: target.channelName,
        channelKind: target.channelKind,
        ...forumDetails(payload, target),
        publishStatus: target.publishStatus,
        publishError: target.publishError,
        status: target.status,
        messageId: target.messageId,
        error: target.error
          ? {
              code: target.error as DeliveryErrorCode,
              message: `${target.error.startsWith("FORUM_") ? `#${target.channelName}: ` : ""}${deliveryErrors[target.error as DeliveryErrorCode]}`,
            }
          : null,
      })),
    };
  };

  function forumDetails(payload: MessagePayload, target: TargetRow) {
    return target.channelKind === "forum"
      ? {
          forumTitle: payload.forumTitle,
          forumTags:
            payload.forumTagNames?.[target.channelId] ??
            payload.forumTags?.[target.channelId] ??
            [],
        }
      : {};
  }
  function tagNames(
    payload: MessagePayload,
    channels: ReturnType<typeof listed>,
    ids: string[],
  ) {
    return Object.fromEntries(
      ids
        .filter((id) => channels.get(id)?.channel.kind === "forum")
        .map((id) => [
          id,
          (payload.forumTags?.[id] ?? []).map(
            (tagId) =>
              channels
                .get(id)
                ?.channel.availableTags?.find((tag) => tag.id === tagId)
                ?.name ?? tagId,
          ),
        ]),
    );
  }
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
    editing = false,
  ) {
    const channels = listed(listing);
    const body = discordMessage(payload, sentAt);
    const record = (
      target: TargetRow,
      change: Partial<typeof sendTargets.$inferInsert>,
    ) =>
      db
        .update(sendTargets)
        .set(
          editing
            ? {
                editStatus: change.status as TargetRow["editStatus"],
                editError: change.error,
                attachmentsJson: change.attachmentsJson,
                attemptedAt: Date.now(),
              }
            : { ...change, attemptedAt: Date.now() },
        )
        .where(eq(sendTargets.id, target.id))
        .run();
    let stopped = false;
    const refusals = new Map<string, number>();
    for (const target of targets) {
      if (stopped || closing) {
        record(target, {
          status: "failed",
          error: editing ? "EDIT_NOT_ATTEMPTED" : "NOT_ATTEMPTED",
        });
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
      if (
        !editing &&
        (!current ||
          !canSendTo(current) ||
          destinationProblem(payload, current))
      ) {
        record(target, {
          status: "failed",
          error: !current
            ? "CHANNEL_GONE"
            : !canSendTo(current)
              ? "MISSING_PERMISSION"
              : destinationFailure(payload, current),
        });
        continue;
      }
      const previous = channelTurns.get(target.channelId) ?? Promise.resolve();
      let release!: () => void;
      const turn = new Promise<void>((resolve) => {
        release = resolve;
      });
      channelTurns.set(target.channelId, turn);
      await previous;
      try {
        if (closing) {
          record(target, {
            status: "failed",
            error: editing ? "EDIT_NOT_ATTEMPTED" : "NOT_ATTEMPTED",
          });
          continue;
        }
        // Marked before the request goes out, so a crash can tell this copy,
        // which may have arrived, from the ones never tried.
        record(target, { status: "posting" });
        const retained = storedAttachments(target).filter((a) =>
          payload.attachments.some((file) => file.id === a.uploadId),
        );
        const addedDrafts = editing
          ? payload.attachments.filter(
              (file) => !retained.some((a) => a.uploadId === file.id),
            )
          : payload.attachments;
        const addedFiles = files.filter((file) =>
          addedDrafts.some((a) => a.filename === file.name),
        );
        const message = editing
          ? await discord.editMessage(
              target.channelKind === "forum"
                ? target.messageId!
                : target.channelId,
              target.messageId!,
              body,
              addedFiles,
              retained,
            )
          : current?.kind === "forum"
            ? await discord.createForum(
                target.channelId,
                payload.forumTitle!.trim(),
                payload.forumTags?.[target.channelId] ?? [],
                body,
                files,
              )
            : await discord.createMessage(target.channelId, body, files);
        const attachments = payload.attachments.map((file) => {
          const kept = editing && retained.find((a) => a.uploadId === file.id);
          const returned =
            kept ||
            message.attachments.find((a) => a.filename === file.filename);
          if (!returned) throw new Error("Missing attachment confirmation");
          return {
            uploadId: file.id,
            id: returned.id,
            filename: returned.filename,
          };
        });
        record(target, {
          status: "sent",
          messageId: message.id,
          error: null,
          attachmentsJson: JSON.stringify(attachments),
        });
        if (!editing && target.publishStatus === "pending")
          await publishCopy({ ...target, messageId: message.id });
        if (editing)
          db.update(sends)
            .set({ lastEditedAt: Date.now() })
            .where(eq(sends.id, sendId))
            .run();
        refusals.delete(target.guildId);
      } catch (error) {
        // A confirmed post stays sent even if recording its secondary publication fails.
        if (
          !editing &&
          db
            .select()
            .from(sendTargets)
            .where(eq(sendTargets.id, target.id))
            .get()?.status === "sent"
        )
          throw error;
        const failure = deliveryFailure(error);
        app.log.warn(
          { code: failure.code, channelId: target.channelId },
          "Delivery failed",
        );
        record(target, {
          status: editing ? "failed" : failure.outcome,
          error:
            editing && failure.outcome === "unknown"
              ? "EDIT_UNCONFIRMED"
              : failure.code,
        });
        stopped = failure.stop;
        if (
          failure.code === "MISSING_PERMISSION" ||
          failure.code === "CHANNEL_GONE"
        )
          refusals.set(target.guildId, (refusals.get(target.guildId) ?? 0) + 1);
        else refusals.delete(target.guildId);
      } finally {
        release();
        if (channelTurns.get(target.channelId) === turn)
          channelTurns.delete(target.channelId);
      }
    }
    if (editing)
      db.update(sends)
        .set({ editStatus: "done", updatedAt: Date.now() })
        .where(eq(sends.id, sendId))
        .run();
    else finish(sendId);
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

  // A temporary listing outage delays delivery, but never holds a schedule indefinitely.
  const maxListingFailureMs = 15 * 60 * 1000;
  let nextListingAt = 0;
  let listingFailures = 0;
  let failingSince: number | null = null;
  let listingInFlight = false;
  function claimDue(cutoff = clock.now()) {
    return sqlite.transaction(() => {
      const claimedAt = clock.now();
      const due = db
        .select()
        .from(sends)
        .where(
          and(eq(sends.status, "scheduled"), lte(sends.scheduledAt, cutoff)),
        )
        .all();
      for (const send of due)
        db.update(sends)
          .set({
            status: "sending",
            createdAt: claimedAt,
            updatedAt: claimedAt,
          })
          .where(eq(sends.id, send.id))
          .run();
      return due.map((send) => ({ ...send, createdAt: claimedAt }));
    })();
  }
  function failScheduled(id: string, code: DeliveryErrorCode) {
    db.update(sendTargets)
      .set({ status: "failed", error: code })
      .where(and(eq(sendTargets.sendId, id), eq(sendTargets.status, "pending")))
      .run();
    finish(id);
  }
  async function tick() {
    try {
      if (closing || listingInFlight || clock.now() < nextListingAt) return;
      if (
        !db
          .select({ id: sends.id })
          .from(sends)
          .where(
            and(
              eq(sends.status, "scheduled"),
              lte(sends.scheduledAt, clock.now()),
            ),
          )
          .get()
      )
        return;
      let listing: GuildsResponse;
      listingInFlight = true;
      try {
        listing = await discord.listGuilds();
        listingFailures = 0;
        failingSince = null;
        nextListingAt = 0;
      } catch (error) {
        const failure = discordFailure(error);
        app.log.warn(
          { code: failure.code },
          "Scheduled delivery could not list servers",
        );
        failingSince ??= clock.now();
        listingFailures++;
        nextListingAt =
          clock.now() +
          Math.min(60000, 5000 * 2 ** Math.min(listingFailures - 1, 4));
        if (!closing) {
          const permanent =
            failure.code === "DISCORD_INVALID_TOKEN" ||
            (failure.status !== undefined &&
              failure.status >= 400 &&
              failure.status < 500 &&
              failure.status !== 429);
          const code: DeliveryErrorCode =
            failure.code === "DISCORD_INVALID_TOKEN"
              ? "INVALID_TOKEN"
              : failure.code === "DISCORD_RATE_LIMITED"
                ? "RATE_LIMITED"
                : failure.code === "DISCORD_UNREACHABLE"
                  ? "UNREACHABLE"
                  : "DISCORD_UNAVAILABLE";
          if (permanent || clock.now() - failingSince >= maxListingFailureMs)
            for (const send of claimDue()) failScheduled(send.id, code);
        }
        return;
      } finally {
        listingInFlight = false;
      }
      if (closing) return;
      for (const send of claimDue()) {
        try {
          const loaded = loadAttachments(
            messagePayloadSchema.parse(JSON.parse(send.payloadJson)),
          );
          if (loaded.missing.size) {
            failScheduled(send.id, "UPLOAD_MISSING");
            continue;
          }
          deliverInBackground(
            send.id,
            copiesFor(send.id),
            loaded.payload,
            loaded.files,
            new Date(send.createdAt),
            listing,
          );
        } catch {
          settleInterrupted(send.id);
        }
      }
    } catch (error) {
      app.log.error(
        { code: safeErrorDetails(error).causeCode ?? "SCHEDULER_FAILED" },
        "Scheduler tick failed",
      );
    }
  }
  const timer = setInterval(() => {
    inBackground(tick());
  }, clock.intervalMs ?? 1000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
  });
  app.addHook("onReady", async () => {
    inBackground(tick());
  });

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
    if (!channelIds.some((id) => channels.get(id)?.channel.kind === "forum")) {
      delete payload.forumTitle;
      delete payload.forumTags;
      delete payload.forumTagNames;
    }
    if (
      !channelIds.some(
        (id) => channels.get(id)?.channel.kind === "announcement",
      )
    )
      delete payload.publish;
    const unavailable: {
      id: string;
      reason: "gone" | "forum" | "permission";
    }[] = [];
    for (const id of channelIds) {
      const found = channels.get(id)?.channel;
      if (!found) unavailable.push({ id, reason: "gone" });
      else if (!canSendTo(found))
        unavailable.push({ id, reason: "permission" });
    }
    const problem = channelIds
      .map((id) => channels.get(id)?.channel)
      .filter((c) => c !== undefined)
      .map((c) => destinationProblem(payload, c))
      .find(Boolean);
    if (problem)
      return reply.code(422).send(sendError("INVALID_REQUEST", problem));
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

    const now = clock.now();
    payload.forumTagNames = tagNames(payload, channels, channelIds);
    const due = parsed.data.scheduledAt
      ? Date.parse(parsed.data.scheduledAt)
      : null;
    if (due !== null && due <= now)
      return reply
        .code(422)
        .send(sendError("SCHEDULE_PAST", "Choose a future date and time."));
    // The same id may arrive twice while the listing above is awaited: the
    // second insert finds the row and hands back that send instead of posting.
    const stored = sqlite.transaction(() => {
      const inserted = db
        .insert(sends)
        .values({
          id: sendId,
          payloadJson: JSON.stringify(payload),
          searchText: searchText(payload),
          status: due === null ? "sending" : "scheduled",
          scheduledAt: due,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run();
      if (inserted.changes === 0) return false;
      destinations = undefined;
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
              channelKind: channel.kind,
              publishStatus:
                payload.publish && channel.kind === "announcement"
                  ? ("pending" as const)
                  : null,
              status: "pending" as const,
              position,
            };
          }),
        )
        .run();
      return true;
    })();
    if (!stored || due !== null) return reply.code(202).send({ id: sendId });
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
    const conditions = [
      "s.status IN ('scheduled', 'cancelled', 'sending', 'done', 'partial', 'failed')",
    ];
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
      params.push(Date.parse(query.to));
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
        "(s.search_text LIKE ? ESCAPE '!' OR fold(json_extract(s.payload_json, '$.forumTitle')) LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM send_targets t WHERE t.send_id = s.id AND (fold(t.guild_name) LIKE ? ESCAPE '!' OR fold(t.channel_name) LIKE ? ESCAPE '!' OR t.guild_id LIKE ? ESCAPE '!' OR t.channel_id LIKE ? ESCAPE '!')))",
      );
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }
    const rows = sqlite
      .prepare(
        `SELECT s.*, (SELECT count(*) FROM send_targets t WHERE t.send_id = s.id) AS channel_count, (SELECT count(*) FROM send_targets t WHERE t.send_id = s.id AND t.status = 'unknown') AS unknown_count, (SELECT count(*) FROM send_targets t WHERE t.send_id = s.id AND t.edit_status = 'failed' AND t.edit_error != 'MESSAGE_DELETED') AS update_failure_count FROM sends s WHERE ${conditions.join(" AND ")} ${query.status === "scheduled" ? "ORDER BY s.scheduled_at ASC, s.id ASC" : "ORDER BY s.created_at DESC, s.id DESC"} LIMIT ? OFFSET ?`,
      )
      .all(...params, query.limit + 1, (query.page - 1) * query.limit) as {
      id: string;
      payload_json: string;
      created_at: number;
      scheduled_at: number | null;
      last_edited_at: number | null;
      status: string;
      channel_count: number;
      unknown_count: number;
      update_failure_count: number;
    }[];
    destinations ??= sqlite
      .prepare(
        "SELECT DISTINCT t.guild_id AS guildId, t.guild_name AS guildName, t.channel_id AS channelId, t.channel_name AS channelName FROM send_targets t JOIN sends s ON s.id = t.send_id WHERE s.status IN ('scheduled', 'cancelled', 'sending', 'done', 'partial', 'failed') ORDER BY t.guild_name, t.channel_name",
      )
      .all() as HistoryDestination[];
    return {
      entries: rows.slice(0, query.limit).map((row) => {
        const payload = messagePayloadSchema.parse(
          JSON.parse(row.payload_json),
        );
        const copies = copiesFor(row.id);
        return {
          forumTags: copies.flatMap((t) =>
            t.channelKind === "forum"
              ? [
                  `#${t.channelName}: ${(payload.forumTagNames?.[t.channelId] ?? payload.forumTags?.[t.channelId] ?? []).join(", ") || "No tags"}`,
                ]
              : [],
          ),
          publishFailureCount: copies.filter(
            (t) => t.status === "sent" && t.publishStatus === "failed",
          ).length,
          id: row.id,
          title: messageTitle(payload),
          color: payload.embeds[0]?.color ?? "",
          createdAt: row.created_at,
          scheduledAt: row.scheduled_at,
          lastEditedAt: row.last_edited_at,
          destinations: copiesFor(row.id).map(
            ({ guildName, guildId, channelName, channelId }) => ({
              guildName,
              guildId,
              channelName,
              channelId,
            }),
          ),
          channelCount: row.channel_count,
          unconfirmed: row.unknown_count === row.channel_count,
          updateFailureCount: row.update_failure_count,
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
    const send = db.select().from(sends).where(eq(sends.id, id)).get();
    if (!send)
      return reply
        .code(404)
        .send(sendError("NOT_FOUND", "That send doesn’t exist."));
    return readSend(send);
  });

  app.delete("/api/sends/:id", async (request, reply) => {
    const parsed = sendIdSchema.safeParse(request.params);
    if (!parsed.success)
      return reply
        .code(400)
        .send(sendError("INVALID_REQUEST", "Invalid send ID."));
    const changed = db
      .update(sends)
      .set({ status: "cancelled", updatedAt: clock.now() })
      .where(and(eq(sends.id, parsed.data.id), eq(sends.status, "scheduled")))
      .run();
    if (
      !changed.changes &&
      db
        .select()
        .from(sends)
        .where(and(eq(sends.id, parsed.data.id), eq(sends.status, "cancelled")))
        .get()
    )
      return reply.code(204).send();
    if (!changed.changes)
      return reply
        .code(409)
        .send(
          sendError(
            "SCHEDULE_STARTED",
            "This schedule has already started or was cancelled.",
          ),
        );
    return reply.code(204).send();
  });

  app.put("/api/sends/:id/schedule", async (request, reply) => {
    const params = sendIdSchema.safeParse(request.params);
    const body = scheduleEditSchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply
        .code(400)
        .send(
          sendError("INVALID_REQUEST", "The schedule request is malformed."),
        );
    let listing: GuildsResponse;
    try {
      listing = await discord.listGuilds();
    } catch (error) {
      return listingFailed(reply, error);
    }
    const channels = listed(listing);
    const outcome = sqlite.transaction(() => {
      const current = db
        .select()
        .from(sends)
        .where(eq(sends.id, params.data.id))
        .get();
      if (current?.status !== "scheduled") return "started";
      const due = Date.parse(body.data.scheduledAt);
      if (due <= clock.now()) return "past";
      if (
        body.data.channelIds.some(
          (id) => !channels.has(id) || !canSendTo(channels.get(id)!.channel),
        )
      )
        return "channels";
      const forumProblem = body.data.channelIds
        .map((id) =>
          destinationProblem(body.data.payload, channels.get(id)!.channel),
        )
        .find(Boolean);
      if (forumProblem) return { forumProblem };
      const loaded = loadAttachments(body.data.payload);
      loaded.payload.forumTagNames = tagNames(
        loaded.payload,
        channels,
        body.data.channelIds,
      );
      if (
        validateMessage(loaded.payload, { missingFiles: loaded.missing }).length
      )
        return { invalid: loaded };
      db.update(sends)
        .set({
          payloadJson: JSON.stringify(loaded.payload),
          searchText: searchText(loaded.payload),
          scheduledAt: due,
          updatedAt: clock.now(),
        })
        .where(eq(sends.id, current.id))
        .run();
      db.delete(sendTargets).where(eq(sendTargets.sendId, current.id)).run();
      db.insert(sendTargets)
        .values(
          body.data.channelIds.map((id, position) => {
            const { guild, channel } = channels.get(id)!;
            return {
              id: randomUUID(),
              sendId: current.id,
              guildId: guild.id,
              guildName: guild.name,
              channelId: id,
              channelName: channel.name,
              channelKind: channel.kind,
              publishStatus:
                loaded.payload.publish && channel.kind === "announcement"
                  ? ("pending" as const)
                  : null,
              status: "pending" as const,
              position,
            };
          }),
        )
        .run();
      destinations = undefined;
      return "saved";
    })();
    if (typeof outcome === "object" && "forumProblem" in outcome)
      return reply
        .code(422)
        .send(sendError("INVALID_REQUEST", outcome.forumProblem!));
    if (typeof outcome === "object")
      return refusal(reply, outcome.invalid.payload, outcome.invalid.missing);
    if (outcome !== "saved")
      return reply
        .code(outcome === "past" ? 422 : 409)
        .send(
          sendError(
            outcome === "past"
              ? "SCHEDULE_PAST"
              : outcome === "channels"
                ? "CHANNELS_UNAVAILABLE"
                : "SCHEDULE_STARTED",
            outcome === "past"
              ? "Choose a future date and time."
              : outcome === "channels"
                ? "Refresh and choose available channels."
                : "This schedule has already started or was cancelled.",
          ),
        );
    return reply.send({ id: params.data.id });
  });

  const copiesFor = (id: string) =>
    db
      .select()
      .from(sendTargets)
      .where(eq(sendTargets.sendId, id))
      .orderBy(asc(sendTargets.position))
      .all();
  const editCopies = (targets: TargetRow[]) =>
    targets.filter((t) => t.messageId && t.editError !== "MESSAGE_DELETED");
  const locked = (send: typeof sends.$inferSelect) =>
    send.status === "scheduled" ||
    send.status === "cancelled" ||
    send.status === "sending" ||
    send.editStatus === "sending";

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
    let listing: GuildsResponse;
    try {
      listing = await discord.listGuilds();
    } catch (error) {
      return listingFailed(reply, error);
    }
    const claim = sqlite.transaction(() => {
      const duplicate = db
        .select()
        .from(editRuns)
        .where(eq(editRuns.id, parsed.data.id))
        .get();
      if (duplicate)
        return duplicate.sendId === id
          ? ("duplicate" as const)
          : ("conflict" as const);
      const current = db.select().from(sends).where(eq(sends.id, id)).get();
      if (!current) return "missing" as const;
      if (locked(current)) return "blocked" as const;
      const copies = editCopies(copiesFor(id));
      if (!copies.length) return "empty" as const;
      const original = messagePayloadSchema.parse(
        JSON.parse(current.payloadJson),
      );
      const candidate = {
        ...parsed.data.payload,
        pings: original.pings,
        silent: original.silent,
        forumTitle: original.forumTitle,
        forumTags: original.forumTags,
        forumTagNames: original.forumTagNames,
        publish: original.publish,
      };
      // Retained metadata comes from the stored payload, never a browser's filename claim.
      candidate.attachments = candidate.attachments.map(
        (file) => original.attachments.find((a) => a.id === file.id) ?? file,
      );
      const loaded = loadEditAttachments(candidate, copies);
      if (
        validateMessage(loaded.payload, { missingFiles: loaded.missing }).length
      )
        return { invalid: loaded };
      db.insert(editRuns).values({ id: parsed.data.id, sendId: id }).run();
      db.update(sends)
        .set({
          editId: parsed.data.id,
          editStatus: "sending",
          payloadJson: JSON.stringify(loaded.payload),
          searchText: searchText(loaded.payload),
          updatedAt: Date.now(),
        })
        .where(eq(sends.id, id))
        .run();
      // Only this run's existing copies appear in its results.
      db.update(sendTargets)
        .set({ editStatus: null, editError: null })
        .where(
          and(
            eq(sendTargets.sendId, id),
            inArray(
              sendTargets.id,
              copies.map((t) => t.id),
            ),
          ),
        )
        .run();
      db.update(sendTargets)
        .set({ editStatus: "pending", editError: null })
        .where(
          inArray(
            sendTargets.id,
            copies.map((t) => t.id),
          ),
        )
        .run();
      return { copies, loaded, createdAt: current.createdAt };
    })();
    if (claim === "missing")
      return reply
        .code(404)
        .send(sendError("NOT_FOUND", "That send doesn’t exist."));
    if (claim === "conflict")
      return reply
        .code(409)
        .send(
          sendError("EDIT_CONFLICT", "This edit ID belongs to another send."),
        );
    if (claim === "blocked" || claim === "empty")
      return reply
        .code(409)
        .send(
          sendError(
            claim === "blocked" ? "EDIT_IN_PROGRESS" : "NO_EDITABLE_COPIES",
            claim === "blocked"
              ? "Wait for the current delivery or update to finish, then try again."
              : "There are no existing copies to update.",
          ),
        );
    if (claim !== "duplicate") {
      if (claim.invalid)
        return refusal(
          reply,
          claim.invalid.payload,
          claim.invalid.missing,
          true,
        );
      deliverInBackground(
        id,
        claim.copies,
        claim.loaded.payload,
        claim.loaded.files,
        new Date(claim.createdAt),
        listing,
        true,
      );
    }
    return reply.code(202).send({ id });
  });

  async function publishCopy(target: TargetRow) {
    db.update(sendTargets)
      .set({ publishStatus: "publishing", publishError: null })
      .where(eq(sendTargets.id, target.id))
      .run();
    try {
      await discord.publishMessage(target.channelId, target.messageId!);
      db.update(sendTargets)
        .set({ publishStatus: "published", publishError: null })
        .where(eq(sendTargets.id, target.id))
        .run();
    } catch (error) {
      if (safeErrorDetails(error).discordCode === 40033) {
        db.update(sendTargets)
          .set({ publishStatus: "published", publishError: null })
          .where(eq(sendTargets.id, target.id))
          .run();
        return;
      }
      const failure = deliveryFailure(error);
      const message =
        failure.code === "RATE_LIMITED"
          ? "Publish limit reached: Discord allows 10 publishes per hour per channel. Wait before retrying."
          : failure.code === "MISSING_PERMISSION"
            ? "Posted successfully, but publishing was refused. Give the bot Send Messages, then retry publish."
            : "Posted successfully, but publication was not confirmed. Retry publish when Discord is available.";
      db.update(sendTargets)
        .set({ publishStatus: "failed", publishError: message })
        .where(eq(sendTargets.id, target.id))
        .run();
    }
  }
  app.post("/api/sends/:id/publish/retry", idParams, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = retryRequestSchema.safeParse(request.body ?? {});
    if (!body.success)
      return reply
        .code(400)
        .send(sendError("INVALID_REQUEST", "Choose copies to publish."));
    if (!db.select().from(sends).where(eq(sends.id, id)).get())
      return reply
        .code(404)
        .send(sendError("NOT_FOUND", "That send doesn’t exist."));
    const copies = copiesFor(id).filter(
      (t) =>
        t.status === "sent" &&
        t.messageId &&
        t.publishStatus === "failed" &&
        (!body.data.targetIds || body.data.targetIds.includes(t.id)),
    );
    // Claim before awaiting Discord so concurrent retries cannot publish the same copy.
    for (const copy of copies)
      db.update(sendTargets)
        .set({ publishStatus: "publishing" })
        .where(eq(sendTargets.id, copy.id))
        .run();
    await Promise.all(copies.map(publishCopy));
    return readSend(db.select().from(sends).where(eq(sends.id, id)).get()!);
  });

  const registerRetry = (editing: boolean) =>
    app.post(
      editing ? "/api/sends/:id/edits/retry" : "/api/sends/:id/retry",
      idParams,
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = retryRequestSchema.safeParse(request.body ?? {});
        if (!body.success)
          return reply
            .code(400)
            .send(
              sendError("INVALID_REQUEST", "The retry request is malformed."),
            );
        let listing: GuildsResponse;
        try {
          listing = await discord.listGuilds();
        } catch (error) {
          return listingFailed(reply, error);
        }
        const claimed = sqlite.transaction(() => {
          const current = db.select().from(sends).where(eq(sends.id, id)).get();
          if (!current) return "missing" as const;
          if (locked(current)) return "blocked" as const;
          const failed = copiesFor(id).filter(
            (t) =>
              (editing
                ? t.editStatus === "failed" &&
                  t.editError !== "MESSAGE_DELETED" &&
                  !!t.messageId
                : t.status === "failed" && !t.messageId) &&
              (!body.data.targetIds || body.data.targetIds.includes(t.id)),
          );
          if (!failed.length) return "empty" as const;
          // Read the current payload only after acquiring the claim: edits may have finished during the listing await.
          const payload = messagePayloadSchema.parse(
            JSON.parse(current.payloadJson),
          );
          const loaded = editing
            ? loadEditAttachments(payload, failed)
            : loadAttachments(payload);
          if (
            validateMessage(loaded.payload, { missingFiles: loaded.missing })
              .length
          )
            return { invalid: loaded };
          db.update(sendTargets)
            .set(
              editing
                ? { editStatus: "pending", editError: null }
                : { status: "pending", error: null },
            )
            .where(
              inArray(
                sendTargets.id,
                failed.map((t) => t.id),
              ),
            )
            .run();
          db.update(sends)
            .set(
              editing
                ? { editStatus: "sending", updatedAt: Date.now() }
                : { status: "sending", updatedAt: Date.now() },
            )
            .where(eq(sends.id, id))
            .run();
          return { copies: failed, loaded, createdAt: current.createdAt };
        })();
        if (claimed === "missing")
          return reply
            .code(404)
            .send(sendError("NOT_FOUND", "That send doesn’t exist."));
        if (claimed === "blocked" || claimed === "empty")
          return reply
            .code(409)
            .send(
              sendError(
                claimed === "blocked" ? "SEND_IN_PROGRESS" : "NOTHING_TO_RETRY",
                claimed === "blocked"
                  ? "Wait for the current delivery or update to finish."
                  : "There are no failed copies to retry.",
              ),
            );
        if (claimed.invalid)
          return refusal(
            reply,
            claimed.invalid.payload,
            claimed.invalid.missing,
            editing,
          );
        deliverInBackground(
          id,
          claimed.copies,
          claimed.loaded.payload,
          claimed.loaded.files,
          new Date(claimed.createdAt),
          listing,
          editing,
        );
        return reply.code(202).send({ id });
      },
    );
  registerRetry(false);
  registerRetry(true);
  return { tick };
}
