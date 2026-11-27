import { randomUUID } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  statSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import multipart from "@fastify/multipart";
import { sanitizeFilename, uploadLimits } from "@embed-dash/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import type { Config } from "./config.js";
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
  const directory = join(config.dataDir, "uploads");
  const maxBytes =
    (config.maxUploadMb ?? uploadLimits.defaultFileMb) * 1024 * 1024;
  await app.register(multipart, {
    limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 1 },
  });
  const tooLarge = {
    error: `Files can be at most ${config.maxUploadMb ?? uploadLimits.defaultFileMb} MB.`,
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
      const part = await request.file();
      if (!part) return reply.code(400).send({ error: "Choose a file." });
      const id = randomUUID();
      const path = join(directory, id);
      mkdirSync(directory, { recursive: true });
      await pipeline(part.file, createWriteStream(path, { flags: "wx" })).catch(
        (error: unknown) => {
          rmSync(path, { force: true });
          throw error;
        },
      );
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

  const find = (id: string) =>
    db.select().from(uploads).where(eq(uploads.id, id)).get();
  const stored = (id: string) => {
    try {
      return statSync(join(directory, id)).isFile();
    } catch {
      return false;
    }
  };

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
    db.delete(uploads).where(eq(uploads.id, id)).run();
    rmSync(join(directory, id), { force: true });
    return reply.code(204).send();
  });
}
