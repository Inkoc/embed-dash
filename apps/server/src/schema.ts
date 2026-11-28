import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
export const sends = sqliteTable(
  "sends",
  {
    id: text("id").primaryKey(),
    payloadJson: text("payload_json").notNull(),
    searchText: text("search_text").notNull(),
    status: text("status", {
      enum: [
        "draft",
        "scheduled",
        "sending",
        "done",
        "partial",
        "failed",
        "cancelled",
      ],
    }).notNull(),
    editId: text("edit_id"),
    editStatus: text("edit_status", { enum: ["sending", "done"] }),
    lastEditedAt: integer("last_edited_at"),
    scheduledAt: integer("scheduled_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("sends_due_idx").on(table.status, table.scheduledAt),
    index("sends_created_at_idx").on(table.createdAt, table.id),
    check(
      "sends_status_check",
      sql`${table.status} IN ('draft', 'scheduled', 'sending', 'done', 'partial', 'failed', 'cancelled')`,
    ),
  ],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  userName: text("user_name"),
  userAvatarUrl: text("user_avatar_url"),
  csrfToken: text("csrf_token").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const sendTargets = sqliteTable(
  "send_targets",
  {
    id: text("id").primaryKey(),
    sendId: text("send_id")
      .notNull()
      .references(() => sends.id, { onDelete: "cascade" }),
    guildId: text("guild_id").notNull(),
    guildName: text("guild_name").notNull(),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name").notNull(),
    messageId: text("message_id"),
    attachmentsJson: text("attachments_json"),
    editStatus: text("edit_status", {
      enum: ["pending", "posting", "sent", "failed"],
    }),
    editError: text("edit_error"),
    status: text("status", {
      enum: ["pending", "posting", "sent", "failed", "unknown"],
    }).notNull(),
    /** A `deliveryErrors` code; the readable text comes from the shared package. */
    error: text("error"),
    attemptedAt: integer("attempted_at"),
    /** Keeps targets in the order the operator saw them. */
    position: integer("position").notNull(),
  },
  (table) => [
    index("send_targets_send_idx").on(table.sendId),
    check(
      "send_targets_status_check",
      sql`${table.status} IN ('pending', 'posting', 'sent', 'failed', 'unknown')`,
    ),
  ],
);

export const editRuns = sqliteTable("edit_runs", {
  retainedJson: text("retained_json"),
  id: text("id").primaryKey(),
  sendId: text("send_id")
    .notNull()
    .references(() => sends.id, { onDelete: "cascade" }),
});

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  payloadJson: text("payload_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
