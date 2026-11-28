import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import {
  messageDraftSchema,
  templateInputSchema,
  templateNameMax,
  templateUpdateSchema,
  type MessageDraft,
  type Template,
} from "@embed-dash/shared";
import type { Config } from "./config.js";
import { templates } from "./schema.js";
import { createUploadStore } from "./uploads.js";

type TemplateRow = typeof templates.$inferSelect;

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
  code: "TEMPLATE_NOT_FOUND",
  error: "That template no longer exists.",
};
/** Says which part was refused: the name is typed by hand, the message comes from the composer. */
const invalid = (issues: readonly { path: readonly PropertyKey[] }[]) =>
  issues[0]?.path[0] === "name"
    ? {
        code: "INVALID_TEMPLATE_NAME",
        error: `Give the template a name of 1 to ${templateNameMax} characters.`,
      }
    : {
        code: "INVALID_TEMPLATE_MESSAGE",
        error: "The message couldn’t be read. Refresh the page and try again.",
      };

/**
 * Saved messages to start new ones from. A template names its files by id,
 * which keeps them from the upload sweep; files gone anyway (a wiped data
 * directory) are reported as missing rather than silently dropped.
 */
export function registerTemplates(
  app: FastifyInstance,
  config: Config,
  sqlite: Database.Database,
) {
  const db = drizzle(sqlite);
  const store = createUploadStore(config.dataDir, sqlite);

  /** Only files the server still has are kept, under the names it recorded. */
  const storedOnly = (message: MessageDraft): MessageDraft => ({
    ...message,
    attachments: message.attachments.flatMap((file) => {
      const row = store.present(file.id);
      return row
        ? [
            {
              id: row.id,
              filename: row.filename,
              size: row.size,
              contentType: row.contentType,
            },
          ]
        : [];
    }),
  });

  const toTemplate = (row: TemplateRow): Template => {
    const message = messageDraftSchema.parse(JSON.parse(row.payloadJson));
    return {
      id: row.id,
      name: row.name,
      updatedAt: new Date(row.updatedAt).toISOString(),
      message,
      missingFiles: message.attachments
        .filter((file) => !store.present(file.id))
        .map((file) => file.id),
    };
  };
  const find = (id: string) =>
    db.select().from(templates).where(eq(templates.id, id)).get();

  app.get("/api/templates", async () =>
    db
      .select()
      .from(templates)
      .orderBy(desc(templates.updatedAt))
      .all()
      .map(toTemplate),
  );

  app.get("/api/templates/:id", idParams, async (request, reply) => {
    const row = find((request.params as { id: string }).id);
    return row ? toTemplate(row) : reply.code(404).send(notFound);
  });

  app.post("/api/templates", async (request, reply) => {
    const parsed = templateInputSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send(invalid(parsed.error.issues));
    const row = {
      id: randomUUID(),
      name: parsed.data.name,
      payloadJson: JSON.stringify(storedOnly(parsed.data.message)),
      updatedAt: Date.now(),
    };
    db.insert(templates).values(row).run();
    return reply.code(201).send(toTemplate(row));
  });

  app.patch("/api/templates/:id", idParams, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = templateUpdateSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send(invalid(parsed.error.issues));
    const { name, message } = parsed.data;
    const row = db
      .update(templates)
      .set({
        name,
        payloadJson: message && JSON.stringify(storedOnly(message)),
        updatedAt: Date.now(),
      })
      .where(eq(templates.id, id))
      .returning()
      .get();
    return row ? toTemplate(row) : reply.code(404).send(notFound);
  });

  // The template's files become unreferenced and the sweep removes them in time.
  app.delete("/api/templates/:id", idParams, async (request, reply) => {
    db.delete(templates)
      .where(eq(templates.id, (request.params as { id: string }).id))
      .run();
    return reply.code(204).send();
  });
}
