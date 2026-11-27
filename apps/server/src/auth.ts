import { randomBytes, timingSafeEqual } from "node:crypto";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { Algorithm, hash, verify } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, lte } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "./config.js";
import { sessions } from "./schema.js";

const cookieName = "embed_session";
const lifetime = 12 * 60 * 60 * 1000;
const random = () => randomBytes(32).toString("hex");

export async function registerAuth(
  app: FastifyInstance,
  config: Config,
  sqlite: Database.Database,
) {
  const db = drizzle(sqlite);
  const passwordHash =
    config.authMode === "password"
      ? await hash(config.adminPassword!, { algorithm: Algorithm.Argon2id })
      : undefined;
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  const find = (request: FastifyRequest) => {
    const id = request.cookies[cookieName];
    const session = id
      ? db.select().from(sessions).where(eq(sessions.id, id)).get()
      : undefined;
    return session && session.expiresAt > Date.now() ? session : undefined;
  };
  const create = (
    request: FastifyRequest,
    reply: FastifyReply,
    subject: string,
  ) => {
    db.delete(sessions).where(lte(sessions.expiresAt, Date.now())).run();
    const session = {
      id: random(),
      subject,
      csrfToken: random(),
      expiresAt: Date.now() + lifetime,
    };
    db.insert(sessions).values(session).run();
    // The reverse proxy must replace forwarded headers and prevent direct access.
    const secure =
      request.protocol === "https" ||
      request.headers["x-forwarded-proto"] === "https";
    reply.setCookie(cookieName, session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: lifetime / 1000,
    });
    return session;
  };
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (path !== "/api" && !path.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    const session = find(request);
    const publicRoute =
      path === "/api/session" ||
      path === "/api/auth/login" ||
      path === "/api/health";
    if (
      !publicRoute &&
      config.authMode !== "none" &&
      session?.subject !== "password"
    )
      return reply.code(401).send({ error: "Sign in to continue" });
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const token = request.headers["x-csrf-token"];
      if (
        !session ||
        typeof token !== "string" ||
        Buffer.byteLength(token) !== Buffer.byteLength(session.csrfToken) ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(session.csrfToken))
      )
        return reply.code(403).send({
          error: "Session token missing or invalid. Refresh and try again.",
        });
    }
  });
  app.get("/api/session", async (request, reply) => {
    const session =
      find(request) ??
      create(
        request,
        reply,
        config.authMode === "none" ? "local" : "anonymous",
      );
    return {
      authMode: config.authMode,
      insecure: config.authMode === "none",
      authenticated:
        config.authMode === "none" || session.subject === "password",
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    };
  });
  app.post(
    "/api/auth/login",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["password"],
          additionalProperties: false,
          properties: {
            password: { type: "string", minLength: 1, maxLength: 1024 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!passwordHash)
        return reply.code(400).send({ error: "Password login is disabled" });
      const { password } = request.body as { password: string };
      if (!(await verify(passwordHash, password)))
        return reply
          .code(401)
          .send({ error: "Incorrect password. Try again." });
      db.delete(sessions)
        .where(eq(sessions.id, request.cookies[cookieName]!))
        .run();
      create(request, reply, "password");
      return { ok: true };
    },
  );
  app.post("/api/auth/logout", async (request, reply) => {
    db.delete(sessions)
      .where(eq(sessions.id, request.cookies[cookieName]!))
      .run();
    reply.clearCookie(cookieName, { path: "/" });
    return { ok: true };
  });
}
