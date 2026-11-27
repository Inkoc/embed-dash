import { registerAuth } from "./auth.js";
import Fastify, { LogController, type FastifyServerOptions } from "fastify";
import fastifyStatic from "@fastify/static";
import type { Config } from "./config.js";
import { createDiscord } from "./discord.js";
import { openDatabase } from "./db.js";
import { discordFailure } from "./errors.js";
import { securityHeaders } from "./security.js";
export async function createApp(
  config: Config,
  options: { spaRoot?: string; logger?: FastifyServerOptions["logger"] } = {},
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
  await registerAuth(app, config, database);
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/bot", async (_request, reply) => {
    try {
      return await discord.getBot();
    } catch (error) {
      const { code, message, statusCode, ...details } = discordFailure(error);
      app.log.warn({ code, ...details }, "Discord bot lookup failed");
      return reply.code(statusCode).send({ code, error: message });
    }
  });
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
    app.log.error({ statusCode }, "Request failed");
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
