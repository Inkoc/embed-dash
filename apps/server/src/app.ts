import Fastify, { type FastifyServerOptions } from "fastify";
import fastifyStatic from "@fastify/static";
import type { Config } from "./config.js";
import { createDiscord } from "./discord.js";
import { openDatabase } from "./db.js";
export async function createApp(
  config: Config,
  options: { spaRoot?: string; logger?: FastifyServerOptions["logger"] } = {},
) {
  const app = Fastify({
    logger: options.logger ?? true,
    disableRequestLogging: true,
  });
  const database = openDatabase(config.dataDir);
  const discord = createDiscord(config);
  app.addHook("onClose", async () => {
    database.close();
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/bot", async (_request, reply) => {
    try {
      return await discord.getBot();
    } catch {
      return reply.code(502).send({
        error:
          "Unable to connect to Discord. Check the bot token and connection, then retry.",
      });
    }
  });
  // Upstream errors may contain credentials, so only fixed messages reach logs and clients.
  app.setErrorHandler((_error, _request, reply) => {
    app.log.error("Request failed");
    return reply.code(500).send({ error: "Request failed" });
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
