import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const sends = sqliteTable("sends", {
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
  scheduledAt: integer("scheduled_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
