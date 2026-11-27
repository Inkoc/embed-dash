import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
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
const csrfCookieName = "embed_csrf";
const lifetime = 12 * 60 * 60 * 1000;
const random = () => randomBytes(32).toString("hex");
const digest = (id: string) => createHash("sha256").update(id).digest("hex");
const isApi = (path: string) => path === "/api" || path.startsWith("/api/");
const equal = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

function decodedPath(url: string) {
  try {
    return decodeURIComponent(url.split("?")[0]);
  } catch {
    return url.split("?")[0];
  }
}

function loopbackHost(host: string | undefined) {
  return (
    !!host && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)
  );
}

function sameOrigin(request: FastifyRequest, publicUrl?: string) {
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const source = request.headers.origin ?? request.headers.referer;
  if (!source || !request.headers.host) return false;
  try {
    return (
      new URL(source).origin ===
      (publicUrl ??
        new URL(`${request.protocol}://${request.headers.host}`).origin)
    );
  } catch {
    return false;
  }
}

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
  const cookieOptions = (request: FastifyRequest) => ({
    httpOnly: true,
    sameSite: "lax" as const,
    secure: request.protocol === "https",
    path: "/",
    maxAge: lifetime / 1000,
  });
  const find = (request: FastifyRequest) => {
    const id = request.cookies[cookieName];
    const session = id
      ? db
          .select()
          .from(sessions)
          .where(eq(sessions.id, digest(id)))
          .get()
      : undefined;
    return session && session.expiresAt > Date.now() ? session : undefined;
  };
  const remove = (request: FastifyRequest) => {
    const id = request.cookies[cookieName];
    if (id)
      db.delete(sessions)
        .where(eq(sessions.id, digest(id)))
        .run();
  };
  const create = (request: FastifyRequest, reply: FastifyReply) => {
    db.delete(sessions).where(lte(sessions.expiresAt, Date.now())).run();
    const id = random();
    db.insert(sessions)
      .values({
        id: digest(id),
        subject: "password",
        csrfToken: random(),
        expiresAt: Date.now() + lifetime,
      })
      .run();
    reply.setCookie(cookieName, id, cookieOptions(request));
    reply.clearCookie(csrfCookieName, { path: "/" });
  };
  app.addHook("onRequest", async (request, reply) => {
    if (config.authMode === "none" && !loopbackHost(request.headers.host))
      return reply
        .code(403)
        .send({ error: "Local mode requires a loopback Host" });
    // Routing decodes paths. Use the matched route, and protect unmatched API paths too.
    const route = request.routeOptions.url;
    if (!isApi(route ?? "") && !isApi(decodedPath(request.url))) return;
    reply.header("Cache-Control", "no-store");
    const session = find(request);
    const publicRoute = route === "/api/session" || route === "/api/auth/login";
    if (
      !publicRoute &&
      config.authMode !== "none" &&
      session?.subject !== "password"
    )
      return reply.code(401).send({ error: "Sign in to continue" });
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (!sameOrigin(request, config.publicUrl))
        return reply.code(403).send({ error: "Request origin is not allowed" });
      const token = request.headers["x-csrf-token"];
      const expected = session?.csrfToken ?? request.cookies[csrfCookieName];
      if (
        typeof token !== "string" ||
        !expected ||
        !/^[a-f0-9]{64}$/.test(expected) ||
        !equal(token, expected)
      )
        return reply.code(403).send({
          error: "Session token missing or invalid. Refresh and try again.",
        });
    }
  });
  app.get("/api/session", async (request, reply) => {
    const session = find(request);
    let csrfToken = session?.csrfToken ?? request.cookies[csrfCookieName];
    if (!csrfToken || !/^[a-f0-9]{64}$/.test(csrfToken)) {
      // Before login there is no server-side state to grow or exhaust.
      csrfToken = random();
      reply.setCookie(csrfCookieName, csrfToken, cookieOptions(request));
    }
    return {
      authMode: config.authMode,
      insecure: config.authMode === "none",
      authenticated:
        config.authMode === "none" || session?.subject === "password",
      csrfToken,
      expiresAt: session?.expiresAt ?? null,
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
      remove(request);
      create(request, reply);
      return { ok: true };
    },
  );
  app.post("/api/auth/logout", async (request, reply) => {
    remove(request);
    reply.clearCookie(cookieName, { path: "/" });
    return { ok: true };
  });
}
