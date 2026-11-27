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
  const pending = new Map<
    string,
    { state: string; verifier: string; expires: number }
  >();
  const oauthCookie = "embed_oauth";
  const oauthLifetime = 5 * 60 * 1000;
  const identity = (
    subject?: string,
  ): { id: string; name: string; avatar: string | null } | null => {
    if (!subject?.startsWith("discord:")) return null;
    return JSON.parse(subject.slice(8)) as {
      id: string;
      name: string;
      avatar: string | null;
    };
  };
  const authenticated = (subject?: string) =>
    config.authMode === "password"
      ? subject === "password"
      : config.authMode === "discord" &&
        !!identity(subject) &&
        config.allowedUserIds!.includes(identity(subject)!.id);
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
  const create = (
    request: FastifyRequest,
    reply: FastifyReply,
    subject = "password",
  ) => {
    db.delete(sessions).where(lte(sessions.expiresAt, Date.now())).run();
    const id = random();
    db.insert(sessions)
      .values({
        id: digest(id),
        subject,
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
    const publicRoute =
      route === "/api/session" ||
      route === "/api/auth/login" ||
      (config.authMode === "discord" &&
        request.method === "GET" &&
        (route === "/api/auth/discord" ||
          route === "/api/auth/discord/callback"));
    if (
      !publicRoute &&
      config.authMode !== "none" &&
      !authenticated(session?.subject)
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
        config.authMode === "none" || authenticated(session?.subject),
      user: authenticated(session?.subject) ? identity(session?.subject) : null,
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
  if (config.authMode === "discord") {
    const redirectUri = `${config.publicUrl}/api/auth/discord/callback`;
    app.get(
      "/api/auth/discord",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      async (request, reply) => {
        for (const [key, value] of pending)
          if (value.expires <= Date.now()) pending.delete(key);
        if (pending.size >= 1000)
          return reply
            .code(429)
            .send({ error: "Sign-in is busy. Try again shortly." });
        const previous = request.cookies[oauthCookie];
        if (previous) pending.delete(digest(previous));
        const browser = random();
        const state = random();
        const verifier = random();
        pending.set(digest(browser), {
          state,
          verifier,
          expires: Date.now() + oauthLifetime,
        });
        reply.setCookie(oauthCookie, browser, {
          ...cookieOptions(request),
          maxAge: oauthLifetime / 1000,
        });
        const url = new URL(config.discordAuthorizeUrl!);
        url.search = new URLSearchParams({
          client_id: config.discordClientId!,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "identify",
          state,
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
          code_challenge_method: "S256",
        }).toString();
        return reply.redirect(url.toString());
      },
    );
    app.get("/api/auth/discord/callback", async (request, reply) => {
      const browser = request.cookies[oauthCookie];
      const transaction = browser ? pending.get(digest(browser)) : undefined;
      // Consume before any upstream request, including failed or cancelled attempts.
      if (browser) pending.delete(digest(browser));
      reply.clearCookie(oauthCookie, { path: "/" });
      const query = request.query as Record<string, unknown>;
      if (
        !transaction ||
        transaction.expires <= Date.now() ||
        typeof query.state !== "string" ||
        !equal(transaction.state, query.state)
      )
        return reply.redirect("/login?oauth=state");
      if (typeof query.code !== "string" || !query.code || query.error)
        return reply.redirect("/login?oauth=cancelled");
      try {
        const tokens = await fetch(`${config.discordApiBase}/oauth2/token`, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: config.discordClientId!,
            client_secret: config.discordClientSecret!,
            grant_type: "authorization_code",
            code: query.code,
            code_verifier: transaction.verifier,
            redirect_uri: redirectUri,
          }),
        });
        if (!tokens.ok) throw new Error();
        const token = (await tokens.json()) as { access_token?: unknown };
        if (typeof token.access_token !== "string" || !token.access_token)
          throw new Error();
        const response = await fetch(`${config.discordApiBase}/users/@me`, {
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
          headers: { authorization: `Bearer ${token.access_token}` },
        });
        if (!response.ok) throw new Error();
        const user = (await response.json()) as {
          id: string;
          username: string;
          global_name?: string;
          avatar?: string;
        };
        if (!/^\d{17,20}$/.test(user.id) || typeof user.username !== "string")
          throw new Error();
        if (!config.allowedUserIds!.includes(user.id))
          return reply.redirect(`/login?denied=${user.id}`);
        const avatar =
          typeof user.avatar === "string" &&
          /^(a_)?[a-f0-9]{32}$/.test(user.avatar)
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
            : null;
        remove(request);
        create(
          request,
          reply,
          "discord:" +
            JSON.stringify({
              id: user.id,
              name:
                typeof user.global_name === "string" && user.global_name
                  ? user.global_name
                  : user.username,
              avatar,
            }),
        );
        return reply.redirect("/");
      } catch {
        // Provider errors can contain credentials. Return only a fixed local error.
        return reply.redirect("/login?oauth=failed");
      }
    });
  }
  app.post("/api/auth/logout", async (request, reply) => {
    remove(request);
    reply.clearCookie(cookieName, { path: "/" });
    return { ok: true };
  });
}
