import { isIP } from "node:net";
import { resolve } from "node:path";
import { snowflakeSchema, uploadLimits } from "@embed-dash/shared";
import { readSecret } from "./secrets.js";
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
  /** Per-file upload limit; the request as a whole is capped by the shared message total. */
  maxUploadMb: number;
  /** Days a file that no stored send refers to is kept, so a draft can wait that long. */
  uploadRetentionDays: number;
  discordApiBase: string;
}
const defaultUploadRetentionDays = 14;
/**
 * An IP address, or a CIDR range such as `172.18.0.0/16` for a proxy on a
 * Docker network. A `/0` range would trust every client to name its own
 * address, so it is refused.
 */
function isProxyAddress(value: string) {
  const [address = "", prefix, ...rest] = value.split("/");
  const family = isIP(address);
  if (!family || rest.length) return false;
  if (prefix === undefined) return true;
  return (
    /^\d{1,3}$/.test(prefix) &&
    Number(prefix) >= 1 &&
    Number(prefix) <= (family === 4 ? 32 : 128)
  );
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseDir = env.INIT_CWD ?? process.cwd();
  const fromBase = (path: string) => resolve(baseDir, path);
  const botToken = readSecret(env, "BOT_TOKEN", fromBase);
  if (!botToken)
    throw new Error("BOT_TOKEN or BOT_TOKEN_FILE must provide the bot token");
  const port = Number(env.PORT ?? 8742);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535");
  const host = env.HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0", "::1", "::"].includes(host))
    throw new Error("HOST must be 127.0.0.1, 0.0.0.0, ::1 or ::");
  const dataDir = env.DATA_DIR ?? "/data";
  if (!dataDir.trim()) throw new Error("DATA_DIR must be a non-empty path");
  const maxUploadMb = Number(env.MAX_UPLOAD_MB ?? uploadLimits.defaultFileMb);
  if (
    !Number.isInteger(maxUploadMb) ||
    maxUploadMb < 1 ||
    maxUploadMb > uploadLimits.maxFileMb
  )
    throw new Error(
      `MAX_UPLOAD_MB must be an integer from 1 to ${uploadLimits.maxFileMb}`,
    );
  const rawRetention = env.UPLOAD_RETENTION_DAYS?.trim();
  const uploadRetentionDays = rawRetention
    ? /^\d+$/.test(rawRetention)
      ? Number(rawRetention)
      : NaN
    : defaultUploadRetentionDays;
  if (!Number.isSafeInteger(uploadRetentionDays) || uploadRetentionDays < 1)
    throw new Error(
      "UPLOAD_RETENTION_DAYS must be a whole number of days, 1 or more",
    );
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
  let adminPassword: string | undefined;
  if (authMode === "password") {
    adminPassword = readSecret(env, "ADMIN_PASSWORD", fromBase, {
      spaces: true,
    });
    if (!adminPassword)
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
    (!trustProxy.length || trustProxy.some((value) => !isProxyAddress(value)))
  )
    throw new Error(
      "TRUST_PROXY must be off or a comma-separated list of proxy IP addresses or CIDR ranges (prefix /1 or longer)",
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
      ? readDiscordLogin(env, fromBase, publicUrl)
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
    maxUploadMb,
    uploadRetentionDays,
    discordApiBase,
  };
}

function readDiscordLogin(
  env: NodeJS.ProcessEnv,
  fromBase: (path: string) => string,
  publicUrl: string | undefined,
): DiscordLoginConfig {
  const clientId = env.DISCORD_CLIENT_ID?.trim() ?? "";
  if (!snowflakeSchema.safeParse(clientId).success)
    throw new Error(
      "DISCORD_CLIENT_ID must be the application ID from the Discord developer portal",
    );
  const clientSecret = readSecret(env, "DISCORD_CLIENT_SECRET", fromBase);
  if (!clientSecret)
    throw new Error(
      "DISCORD_CLIENT_SECRET or DISCORD_CLIENT_SECRET_FILE must provide the client secret",
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
