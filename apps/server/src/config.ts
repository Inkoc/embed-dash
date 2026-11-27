import { readFileSync } from "node:fs";
import { resolve } from "node:path";
export interface Config {
  botToken: string;
  port: number;
  dataDir: string;
  discordApiBase: string;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  let botToken = env.BOT_TOKEN ?? "";
  if (env.BOT_TOKEN_FILE) {
    try {
      botToken = readFileSync(env.BOT_TOKEN_FILE, "utf8");
    } catch {
      throw new Error("BOT_TOKEN_FILE must point to a readable secret file");
    }
  }
  botToken = botToken.trim();
  if (!botToken || /\s/.test(botToken))
    throw new Error(
      "BOT_TOKEN or BOT_TOKEN_FILE must provide a non-empty token without whitespace",
    );
  const port = Number(env.PORT ?? 8742);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535");
  const dataDir = env.DATA_DIR ?? "/data";
  if (!dataDir.trim()) throw new Error("DATA_DIR must be a non-empty path");
  const discordApiBase = (
    env.DISCORD_API_BASE ?? "https://discord.com/api"
  ).replace(/\/$/, "");
  try {
    const url = new URL(discordApiBase);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new Error(
      "DISCORD_API_BASE must be an HTTP(S) URL without credentials, query or fragment",
    );
  }
  return { botToken, port, dataDir: resolve(dataDir), discordApiBase };
}
