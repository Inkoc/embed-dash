import { isIP } from "node:net";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
export interface Config {
  botToken: string;
  authMode: "password" | "none" | "discord";
  adminPassword?: string;
  discordClientId?: string;
  discordClientSecret?: string;
  allowedUserIds?: string[];
  discordAuthorizeUrl?: string;
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
  if (!["password", "none", "discord"].includes(authMode))
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
  if (env.PUBLIC_URL !== undefined) {
    try {
      const url = new URL(env.PUBLIC_URL);
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
  let discordClientSecret: string | undefined;
  let allowedUserIds: string[] | undefined;
  const discordAuthorizeUrl =
    env.DISCORD_AUTHORIZE_URL ?? "https://discord.com/oauth2/authorize";
  if (authMode === "discord") {
    if (!publicUrl) throw new Error("PUBLIC_URL is required for Discord login");
    if (!/^\d{17,20}$/.test(env.DISCORD_CLIENT_ID ?? ""))
      throw new Error("DISCORD_CLIENT_ID must be a Discord ID");
    discordClientSecret = env.DISCORD_CLIENT_SECRET;
    if (env.DISCORD_CLIENT_SECRET_FILE) {
      try {
        discordClientSecret = readFileSync(
          resolve(baseDir, env.DISCORD_CLIENT_SECRET_FILE),
          "utf8",
        );
      } catch {
        throw new Error(
          "DISCORD_CLIENT_SECRET_FILE must point to a readable secret file",
        );
      }
    }
    discordClientSecret = discordClientSecret?.trim();
    if (!discordClientSecret || /\s/.test(discordClientSecret))
      throw new Error(
        "DISCORD_CLIENT_SECRET or DISCORD_CLIENT_SECRET_FILE must provide a non-empty secret without whitespace",
      );
    allowedUserIds = (env.ALLOWED_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim());
    if (allowedUserIds.some((value) => !/^\d{17,20}$/.test(value)))
      throw new Error(
        "ALLOWED_USER_IDS must be a non-empty comma-separated list of Discord IDs",
      );
    try {
      const url = new URL(discordAuthorizeUrl);
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
        "DISCORD_AUTHORIZE_URL must be an HTTP(S) URL without credentials, query or fragment",
      );
    }
  }
  return {
    discordClientId: env.DISCORD_CLIENT_ID,
    discordClientSecret,
    allowedUserIds,
    discordAuthorizeUrl,
    trustProxy,
    publicUrl,
    authMode: authMode as Config["authMode"],
    adminPassword,
    botToken,
    port,
    host,
    dataDir: resolve(baseDir, dataDir),
    discordApiBase,
  };
}
