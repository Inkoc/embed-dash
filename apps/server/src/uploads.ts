import { randomUUID } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  closeSync,
  statSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import multipart from "@fastify/multipart";
import { sanitizeFilename } from "@embed-dash/shared";
import { and, eq, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import { safeErrorDetails } from "./errors.js";
import { uploads } from "./schema.js";

/** Types an `<img>` can show without being able to run anything; SVG is deliberately absent. */
const imageSignatures: [string, number[]][] = [
  ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/gif", [0x47, 0x49, 0x46, 0x38]],
];

/** The type is read from the bytes: the one the browser reports is the sender's claim. */
export function sniffContentType(head: Buffer): string {
  for (const [type, signature] of imageSignatures)
    if (signature.every((byte, i) => head[i] === byte)) return type;
  if (
    head.subarray(0, 4).toString("latin1") === "RIFF" &&
    head.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  return "application/octet-stream";
}

/** Which of the multipart plugin's refusals an error is, so the person sees why. */
function multipartRefusal(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  if (code === "FST_REQ_FILE_TOO_LARGE") return "size";
  if (
    code === "FST_FILES_LIMIT" ||
    code === "FST_PARTS_LIMIT" ||
    code === "FST_FIELDS_LIMIT"
  )
    return "parts";
  if (code === "FST_INVALID_MULTIPART_CONTENT_TYPE") return "type";
  return undefined;
}

const isServedImage = (contentType: string) => contentType.startsWith("image/");
const idParams = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", format: "uuid" } },
    },
  },
};

function head(path: string) {
  const buffer = Buffer.alloc(16);
  const fd = openSync(path, "r");
  try {
    return buffer.subarray(0, readSync(fd, buffer, 0, 16, 0));
  } finally {
    closeSync(fd);
  }
}

/** The upload records and the files behind them; a record without its file counts as gone. */
export function createUploadStore(dataDir: string, sqlite: Database.Database) {
  const db = drizzle(sqlite);
  const directory = join(dataDir, "uploads");
  const find = (id: string) =>
    db.select().from(uploads).where(eq(uploads.id, id)).get();
  const stored = (id: string) => {
    try {
      return statSync(join(directory, id)).isFile();
    } catch {
      return false;
    }
  };
  return {
    directory,
    find,
    stored,
    /** The record if its file is still on disk. */
    present: (id: string) => {
      const row = find(id);
      return row && stored(id) ? row : undefined;
    },
  };
}

const dayMs = 24 * 60 * 60 * 1000;
const sweepEveryMs = 60 * 60 * 1000;

/** True for an upload some stored send names, whatever its status: a retry sends the file again. */
const referencedBySend = sql`exists (
  select 1 from sends, json_each(sends.payload_json, '$.attachments') as attachment
  where json_extract(attachment.value, '$.id') = ${uploads.id}
)`;

/**
 * Removes files older than the retention period that no stored send refers
 * to. Drafts live in the browser, so a file only a draft uses counts as
 * unreferenced; the composer marks it missing if the draft comes back later.
 * Files on disk without a record (an interrupted upload) go too.
 */
export function sweepUploads(
  dataDir: string,
  sqlite: Database.Database,
  retentionDays: number,
  now = Date.now(),
) {
  const db = drizzle(sqlite);
  const cutoff = now - retentionDays * dayMs;
  const stale = db
    .delete(uploads)
    .where(and(lt(uploads.createdAt, cutoff), sql`not ${referencedBySend}`))
    .returning({ id: uploads.id })
    .all();
  const { directory, find } = createUploadStore(dataDir, sqlite);
  for (const { id } of stale) rmSync(join(directory, id), { force: true });
  let names: string[] = [];
  try {
    names = readdirSync(directory);
  } catch {
    // No upload has been stored yet.
  }
  for (const name of names) {
    const path = join(directory, name);
    if (!find(name) && statSync(path).mtimeMs < cutoff)
      rmSync(path, { force: true });
  }
}

/**
 * Uploaded files are untrusted. They are stored under generated names, never
 * served except as images whose type was sniffed from the bytes, and never
 * fetched or interpreted by the server.
 */
export async function registerUploads(
  app: FastifyInstance,
  config: Config,
  sqlite: Database.Database,
) {
  const db = drizzle(sqlite);
  const { directory, find, stored } = createUploadStore(config.dataDir, sqlite);
  const maxBytes = config.maxUploadMb * 1024 * 1024;
  await app.register(multipart, {
    limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 1 },
  });
  // A failed sweep only leaves files for the next one; it must never stop the server.
  const sweep = () => {
    try {
      sweepUploads(config.dataDir, sqlite, config.uploadRetentionDays);
    } catch (error) {
      app.log.warn(safeErrorDetails(error), "Upload cleanup failed");
    }
  };
  sweep();
  const sweeper = setInterval(sweep, sweepEveryMs);
  sweeper.unref();
  app.addHook("onClose", async () => clearInterval(sweeper));
  const tooLarge = {
    error: `Files can be at most ${config.maxUploadMb} MB.`,
  };

  app.post(
    "/api/uploads",
    {
      // Refuse on the declared length before any of the body is read; the
      // stream limit below covers requests that don't declare one.
      onRequest: async (request, reply) => {
        const declared = Number(request.headers["content-length"]);
        if (declared > maxBytes + 64 * 1024)
          return reply.code(413).send(tooLarge);
      },
    },
    async (request, reply) => {
      const id = randomUUID();
      const path = join(directory, id);
      let part: Awaited<ReturnType<typeof request.file>>;
      try {
        part = await request.file();
        if (!part) return reply.code(400).send({ error: "Choose a file." });
        mkdirSync(directory, { recursive: true });
        await pipeline(part.file, createWriteStream(path, { flags: "wx" }));
      } catch (error) {
        rmSync(path, { force: true });
        const refusal = multipartRefusal(error);
        if (refusal === "size") return reply.code(413).send(tooLarge);
        if (refusal === "parts")
          return reply.code(413).send({ error: "Send one file per upload." });
        if (refusal === "type")
          return reply
            .code(415)
            .send({ error: "Uploads must be sent as a file form." });
        throw error;
      }
      const size = statSync(path).size;
      if (part.file.truncated || size > maxBytes) {
        rmSync(path, { force: true });
        return reply.code(413).send(tooLarge);
      }
      if (size === 0) {
        rmSync(path, { force: true });
        return reply.code(400).send({ error: "That file is empty." });
      }
      const row = {
        id,
        filename: sanitizeFilename(part.filename),
        contentType: sniffContentType(head(path)),
        size,
        createdAt: Date.now(),
      };
      db.insert(uploads).values(row).run();
      return reply.code(201).send({
        id,
        filename: row.filename,
        size,
        contentType: row.contentType,
      });
    },
  );

  app.get("/api/uploads/:id", idParams, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = find(id);
    if (!row || !stored(id))
      return reply.code(404).send({ error: "File not found" });
    return {
      id,
      filename: row.filename,
      size: row.size,
      contentType: row.contentType,
    };
  });

  // Only images are served back, so the preview can show them after a reload.
  app.get("/api/uploads/:id/content", idParams, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = find(id);
    if (!row || !isServedImage(row.contentType) || !stored(id))
      return reply.code(404).send({ error: "File not found" });
    return reply
      .header("Content-Type", row.contentType)
      .header("Content-Disposition", "inline")
      .header("Cache-Control", "private, max-age=3600, immutable")
      .send(createReadStream(join(directory, id)));
  });

  app.delete("/api/uploads/:id", idParams, async (request, reply) => {
    const { id } = request.params as { id: string };
    // The draft lets go of the file, but a send that names it may still need
    // it for a retry; the sweep removes it once nothing refers to it.
    const removed = db
      .delete(uploads)
      .where(and(eq(uploads.id, id), sql`not ${referencedBySend}`))
      .returning({ id: uploads.id })
      .all();
    if (removed.length || !find(id))
      rmSync(join(directory, id), { force: true });
    return reply.code(204).send();
  });
}
