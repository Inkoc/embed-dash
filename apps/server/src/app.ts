import { registerAuth } from "./auth.js";
import { registerChannelGroups } from "./channelGroups.js";
import Fastify, {
  LogController,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from "fastify";
import fastifyStatic from "@fastify/static";
import { checkBot } from "./botCheck.js";
import type { Config } from "./config.js";
import { createDiscord } from "./discord.js";
import { openDatabase } from "./db.js";
import { discordFailure, safeErrorDetails } from "./errors.js";
import { registerSends } from "./sends.js";
import { securityHeaders } from "./security.js";
import { registerTemplates } from "./templates.js";
import { registerUploads } from "./uploads.js";
export async function createApp(
  config: Config,
  options: {
    spaRoot?: string;
    logger?: FastifyServerOptions["logger"];
    sendClock?: { now: () => number; intervalMs?: number };
  } = {},
) {
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: config.trustProxy ?? false,
    logController: new LogController({ disableRequestLogging: true }),
  });
  if (config.authMode === "none" && !["127.0.0.1", "::1"].includes(config.host))
    app.log.warn(
      "No-login mode is bound beyond loopback. Keep the published port on 127.0.0.1; anyone who can reach it can use the bot.",
    );
  const headers = securityHeaders(options.spaRoot);
  app.addHook("onSend", async (_request, reply) => {
    reply.headers(headers);
  });
  const database = openDatabase(config.dataDir);
  const discord = createDiscord(config);
  app.addHook("onClose", async () => {
    database.close();
  });
  // Not awaited: startup never waits on Discord, and the check logs its own failures.
  app.addHook("onListen", async () => {
    void checkBot(discord.getBot, app.log);
  });
  await registerAuth(app, config, database);
  await registerUploads(app, config, database);
  await registerSends(app, config, database, discord, options.sendClock);
  registerTemplates(app, config, database);
  registerChannelGroups(app, database, discord);
  app.get("/health", async () => ({ status: "ok" }));
  const fromDiscord =
    <T>(what: string, load: (request: FastifyRequest) => Promise<T>) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return await load(request);
      } catch (error) {
        const { code, message, statusCode, ...details } = discordFailure(error);
        app.log.warn({ code, ...details }, `Discord ${what} failed`);
        return reply.code(statusCode).send({ code, error: message });
      }
    };
  app.get(
    "/api/bot",
    fromDiscord("bot lookup", () => discord.getBot()),
  );
  app.get(
    "/api/guilds",
    fromDiscord("guild listing", (request) => {
      const { refresh } = request.query as { refresh?: string };
      return discord.listGuilds({ refresh: refresh === "1" });
    }),
  );
  // Upstream errors may contain credentials, so only fixed messages reach logs and clients.
  app.setErrorHandler((error, _request, reply) => {
    const status =
      error && typeof error === "object" && "statusCode" in error
        ? error.statusCode
        : undefined;
    const statusCode =
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 400 &&
      status < 500
        ? status
        : 500;
    app.log.error({ statusCode, ...safeErrorDetails(error) }, "Request failed");
    return reply.code(statusCode).send({ error: "Request failed" });
  });
  if (options.spaRoot) {
    await app.register(fastifyStatic, {
      root: options.spaRoot,
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === "GET" &&
        !request.url.startsWith("/api/") &&
        !request.url.startsWith("/assets/")
      )
        return reply.sendFile("index.html");
      return reply.code(404).send({ error: "Not found" });
    });
  }
  return app;
}
