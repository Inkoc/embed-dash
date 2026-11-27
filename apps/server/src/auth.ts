import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { Algorithm, hash, verify } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, lte } from "drizzle-orm";
import type Database from "better-sqlite3";
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { snowflakeSchema, type SessionUser } from "@embed-dash/shared";
import type { Config } from "./config.js";
import { authorizeUrl, fetchDiscordUser, OAuthError } from "./discord-oauth.js";
import { safeErrorDetails } from "./errors.js";
import { sessions } from "./schema.js";

const cookieName = "embed_session";
const csrfCookieName = "embed_csrf";
const stateCookieName = "embed_oauth_state";
const deniedCookieName = "embed_denied";
const discordPath = "/api/auth/discord";
const lifetime = 12 * 60 * 60 * 1000;
const stateLifetime = 10 * 60 * 1000;
const maxPendingStates = 1000;
const discordSubject = "discord:";
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

/**
 * A refused origin that looks like an HTTPS reverse proxy the server wasn't
 * told about: the page is on HTTPS (or the proxy says so in forwarded
 * headers) while the server, not trusting the proxy, sees plain HTTP. Only
 * worth saying when neither TRUST_PROXY nor PUBLIC_URL could have fixed it.
 */
function untrustedProxy(request: FastifyRequest, config: Config) {
  if (config.publicUrl || config.trustProxy) return false;
  const headers = request.headers;
  if (
    headers["x-forwarded-proto"] ||
    headers["x-forwarded-host"] ||
    headers.forwarded
  )
    return true;
  const source = headers.origin ?? headers.referer;
  try {
    return (
      !!source &&
      request.protocol === "http" &&
      new URL(source).protocol === "https:" &&
      new URL(source).host === headers.host
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
  const discord =
    config.authMode === "discord"
      ? { login: config.discordLogin, publicUrl: config.publicUrl }
      : undefined;
  if (discord && (!discord.login || !discord.publicUrl))
    throw new Error("Discord login needs discordLogin and publicUrl config");
  const allowed = new Set(discord?.login?.allowedUserIds);
  // Removing an ID from the allowlist also ends that person's open sessions.
  const valid = (subject: string) =>
    discord
      ? subject.startsWith(discordSubject) &&
        allowed.has(subject.slice(discordSubject.length))
      : subject === "password";
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
    return session && session.expiresAt > Date.now() && valid(session.subject)
      ? session
      : undefined;
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
    subject: string,
    user?: SessionUser,
  ) => {
    db.delete(sessions).where(lte(sessions.expiresAt, Date.now())).run();
    const id = random();
    db.insert(sessions)
      .values({
        id: digest(id),
        subject,
        userName: user?.name,
        userAvatarUrl: user?.avatarUrl,
        csrfToken: random(),
        expiresAt: Date.now() + lifetime,
      })
      .run();
    reply.setCookie(cookieName, id, cookieOptions(request));
    reply.clearCookie(csrfCookieName, { path: "/" });
  };
  app.addHook("onRequest", async (request, reply) => {
    if (config.authMode === "none" && !loopbackHost(request.headers.host))
      return reply.code(403).send({
        code: "LOCAL_ONLY",
        error: "Local mode requires a loopback Host",
      });
    // Routing decodes paths. Use the matched route, and protect unmatched API paths too.
    const route = request.routeOptions.url;
    if (!isApi(route ?? "") && !isApi(decodedPath(request.url))) return;
    reply.header("Cache-Control", "no-store");
    const session = find(request);
    const publicRoute = [
      "/api/session",
      "/api/auth/login",
      discordPath,
      `${discordPath}/callback`,
    ].includes(route ?? "");
    if (!publicRoute && config.authMode !== "none" && !session)
      return reply
        .code(401)
        .send({ code: "SIGNED_OUT", error: "Sign in to continue" });
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (!sameOrigin(request, config.publicUrl))
        return reply.code(403).send(
          untrustedProxy(request, config)
            ? {
                code: "PROXY_NOT_TRUSTED",
                error:
                  "This page was opened through an HTTPS proxy the server isn't set up for. Set TRUST_PROXY to the proxy's address, or PUBLIC_URL to the address in the browser, then restart.",
              }
            : {
                code: "ORIGIN_REFUSED",
                error: "Request origin is not allowed",
              },
        );
      const token = request.headers["x-csrf-token"];
      const expected = session?.csrfToken ?? request.cookies[csrfCookieName];
      if (
        typeof token !== "string" ||
        !expected ||
        !/^[a-f0-9]{64}$/.test(expected) ||
        !equal(token, expected)
      )
        return reply.code(403).send({
          code: "CSRF_INVALID",
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
    const denied = snowflakeSchema.safeParse(request.cookies[deniedCookieName]);
    return {
      authMode: config.authMode,
      insecure: config.authMode === "none",
      authenticated: config.authMode === "none" || !!session,
      csrfToken,
      maxUploadMb: config.maxUploadMb,
      expiresAt: session?.expiresAt ?? null,
      user: session?.userName
        ? {
            id: session.subject.slice(discordSubject.length),
            name: session.userName,
            avatarUrl: session.userAvatarUrl,
          }
        : null,
      deniedUserId: denied.success ? denied.data : null,
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
        return reply.code(401).send({
          code: "WRONG_PASSWORD",
          error: "Incorrect password. Try again.",
        });
      remove(request);
      create(request, reply, "password");
      return { ok: true };
    },
  );
  app.post("/api/auth/logout", async (request, reply) => {
    remove(request);
    reply.clearCookie(cookieName, { path: "/" });
    return { ok: true };
  });
  if (discord?.login && discord.publicUrl) {
    const { login, publicUrl } = discord;
    // In memory on purpose: a restart only cancels sign-ins that are under way.
    const pending = new Map<string, number>();
    const stateCookie = (request: FastifyRequest) => ({
      ...cookieOptions(request),
      path: discordPath,
      maxAge: stateLifetime / 1000,
    });
    const retry = (reply: FastifyReply, reason: string) =>
      reply.redirect(`/login?auth=${reason}`);
    // These routes are browser navigations, so hitting the limit lands on the
    // login screen with an explanation rather than a raw JSON error.
    const busy = async (
      error: FastifyError,
      _request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      if (error.statusCode !== 429) throw error;
      return retry(reply, "busy");
    };
    const logFailure = (message: string, error: unknown) =>
      app.log.warn(
        {
          stage: error instanceof OAuthError ? error.stage : undefined,
          status: error instanceof OAuthError ? error.status : undefined,
          ...safeErrorDetails(error instanceof Error ? error.cause : error),
        },
        message,
      );
    app.get(
      discordPath,
      {
        config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
        errorHandler: busy,
      },
      async (request, reply) => {
        const now = Date.now();
        for (const [state, expiresAt] of pending)
          if (expiresAt <= now || pending.size >= maxPendingStates)
            pending.delete(state);
        const state = random();
        pending.set(state, now + stateLifetime);
        reply.setCookie(stateCookieName, state, stateCookie(request));
        reply.clearCookie(deniedCookieName, { path: "/" });
        return reply.redirect(
          authorizeUrl({ ...config, discordLogin: login, publicUrl }, state),
        );
      },
    );
    // Discord sends the browser here with a GET, so the origin and CSRF checks
    // for writes cannot apply; the state bound to this browser takes their place.
    app.get(
      `${discordPath}/callback`,
      {
        config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
        errorHandler: busy,
      },
      async (request, reply) => {
        const query = request.query as Record<string, unknown>;
        const bound = request.cookies[stateCookieName];
        reply.clearCookie(stateCookieName, { path: discordPath });
        const state = typeof query.state === "string" ? query.state : "";
        const expiresAt =
          bound && equal(state, bound) ? pending.get(state) : undefined;
        if (expiresAt === undefined) return retry(reply, "expired");
        pending.delete(state);
        if (expiresAt <= Date.now()) return retry(reply, "expired");
        if (typeof query.error === "string") return retry(reply, "cancelled");
        const code = query.code;
        if (typeof code !== "string" || !code || code.length > 512)
          return retry(reply, "failed");
        let user: SessionUser;
        try {
          user = await fetchDiscordUser(
            { ...config, discordLogin: login, publicUrl },
            code,
            (error) => logFailure("Discord token revoke failed", error),
          );
        } catch (error) {
          logFailure("Discord sign-in failed", error);
          return retry(reply, "failed");
        }
        if (!allowed.has(user.id)) {
          // Otherwise the old identity would stay signed in behind this refusal.
          remove(request);
          reply.clearCookie(cookieName, { path: "/" });
          reply.setCookie(deniedCookieName, user.id, {
            ...cookieOptions(request),
            maxAge: stateLifetime / 1000,
          });
          return reply.redirect("/login");
        }
        remove(request);
        create(request, reply, discordSubject + user.id, user);
        return reply.redirect("/");
      },
    );
  }
}
