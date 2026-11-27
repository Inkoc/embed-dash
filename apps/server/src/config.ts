import { isIP } from "node:net";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { snowflakeSchema } from "@embed-dash/shared";
export interface DiscordLoginConfig {
  clientId: string;
  clientSecret: string;
  allowedUserIds: string[];
}
export interface Config {
  botToken: string;
  authMode: "password" | "none" | "discord";
  adminPassword?: string;
  discordLogin?: DiscordLoginConfig;
  trustProxy?: string[];
  publicUrl?: string;
  port: number;
  host: string;
  dataDir: string;
  discordApiBase: string;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseDir = env.INIT_CWD ?? process.cwd();
  let botToken = env.BOT_TOKEN ?? "";
  if (env.BOT_TOKEN_FILE) {
    try {
      botToken = readFileSync(resolve(baseDir, env.BOT_TOKEN_FILE), "utf8");
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
  const host = env.HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0", "::1", "::"].includes(host))
    throw new Error("HOST must be 127.0.0.1, 0.0.0.0, ::1 or ::");
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
  const authMode = env.AUTH_MODE ?? "password";
  if (authMode !== "password" && authMode !== "none" && authMode !== "discord")
    throw new Error("AUTH_MODE must be password, none or discord");
  let adminPassword = env.ADMIN_PASSWORD;
  if (authMode === "password") {
    if (env.ADMIN_PASSWORD_FILE) {
      try {
        adminPassword = readFileSync(
          resolve(baseDir, env.ADMIN_PASSWORD_FILE),
          "utf8",
        ).trimEnd();
      } catch {
        throw new Error(
          "ADMIN_PASSWORD_FILE must point to a readable secret file",
        );
      }
    }
    if (!adminPassword?.trim())
      throw new Error(
        "ADMIN_PASSWORD or ADMIN_PASSWORD_FILE must provide a non-empty password",
      );
  }
  const trustProxy =
    env.TRUST_PROXY === undefined || env.TRUST_PROXY === "off"
      ? undefined
      : env.TRUST_PROXY.split(",").map((value) => value.trim());
  if (
    trustProxy &&
    (!trustProxy.length || trustProxy.some((value) => !isIP(value)))
  )
    throw new Error(
      "TRUST_PROXY must be off or a comma-separated list of proxy IP addresses",
    );
  let publicUrl: string | undefined;
  // Compose passes unset variables through as empty strings.
  const rawPublicUrl = env.PUBLIC_URL?.trim();
  if (rawPublicUrl) {
    try {
      const url = new URL(rawPublicUrl);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error();
      publicUrl = url.origin;
    } catch {
      throw new Error(
        "PUBLIC_URL must be an HTTP(S) origin without credentials or a path",
      );
    }
  }
  const discordLogin =
    authMode === "discord"
      ? readDiscordLogin(env, baseDir, publicUrl)
      : undefined;
  return {
    trustProxy,
    publicUrl,
    authMode,
    adminPassword,
    discordLogin,
    botToken,
    port,
    host,
    dataDir: resolve(baseDir, dataDir),
    discordApiBase,
  };
}

function readDiscordLogin(
  env: NodeJS.ProcessEnv,
  baseDir: string,
  publicUrl: string | undefined,
): DiscordLoginConfig {
  const clientId = env.DISCORD_CLIENT_ID?.trim() ?? "";
  if (!snowflakeSchema.safeParse(clientId).success)
    throw new Error(
      "DISCORD_CLIENT_ID must be the application ID from the Discord developer portal",
    );
  let clientSecret = env.DISCORD_CLIENT_SECRET ?? "";
  if (env.DISCORD_CLIENT_SECRET_FILE) {
    try {
      clientSecret = readFileSync(
        resolve(baseDir, env.DISCORD_CLIENT_SECRET_FILE),
        "utf8",
      );
    } catch {
      throw new Error(
        "DISCORD_CLIENT_SECRET_FILE must point to a readable secret file",
      );
    }
  }
  clientSecret = clientSecret.trim();
  if (!clientSecret || /\s/.test(clientSecret))
    throw new Error(
      "DISCORD_CLIENT_SECRET or DISCORD_CLIENT_SECRET_FILE must provide a non-empty secret without whitespace",
    );
  if (!publicUrl)
    throw new Error(
      "PUBLIC_URL is required with AUTH_MODE=discord; it sets the OAuth redirect address",
    );
  const allowedUserIds = (env.ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !allowedUserIds.length ||
    !allowedUserIds.every((id) => snowflakeSchema.safeParse(id).success)
  )
    throw new Error(
      "ALLOWED_USER_IDS must be a comma-separated list of Discord user IDs",
    );
  return {
    clientId,
    clientSecret,
    allowedUserIds: [...new Set(allowedUserIds)],
  };
}
