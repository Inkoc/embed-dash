import { RateLimitError } from "@discordjs/rest";
import type { DeliveryErrorCode } from "@embed-dash/shared";

const safeCodes = new Set([
  "EADDRINUSE",
  "EACCES",
  "EEXIST",
  "EPERM",
  "ENOENT",
  "ENOTDIR",
  "EROFS",
  "ENOSPC",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "SQLITE_ERROR",
  "SQLITE_CANTOPEN",
  "SQLITE_READONLY",
  "SQLITE_CORRUPT",
  "SQLITE_NOTADB",
  "SQLITE_BUSY",
  "SQLITE_FULL",
  "SQLITE_IOERR",
]);

// Error messages, request bodies and arbitrary string codes can contain secrets.
export function safeErrorDetails(error: unknown): {
  status?: number;
  causeCode?: string | number;
} {
  if (!error || typeof error !== "object") return {};
  const value = error as {
    status?: unknown;
    code?: unknown;
    cause?: unknown;
    errors?: unknown[];
  };
  const status =
    typeof value.status === "number" &&
    Number.isInteger(value.status) &&
    value.status >= 100 &&
    value.status <= 599
      ? value.status
      : undefined;
  const causeCode =
    typeof value.code === "number" && Number.isSafeInteger(value.code)
      ? value.code
      : typeof value.code === "string" && safeCodes.has(value.code)
        ? value.code
        : undefined;
  const nested = safeErrorDetails(value.cause);
  const aggregate = Array.isArray(value.errors)
    ? value.errors
        .map(safeErrorDetails)
        .find((detail) => detail.causeCode !== undefined)
    : undefined;
  return {
    status: status ?? nested.status,
    causeCode: causeCode ?? nested.causeCode ?? aggregate?.causeCode,
  };
}

export function discordFailure(error: unknown) {
  const details = safeErrorDetails(error);
  if (error instanceof RateLimitError || details.status === 429)
    return {
      ...details,
      code: "DISCORD_RATE_LIMITED",
      statusCode: 503,
      message: "Discord rate limit reached. Wait a moment, then retry.",
    };
  if (details.status === 401)
    return {
      ...details,
      code: "DISCORD_INVALID_TOKEN",
      statusCode: 502,
      message:
        "Discord rejected the bot token. Check the configured token, then retry.",
    };
  if (details.status !== undefined && details.status >= 500)
    return {
      ...details,
      code: "DISCORD_UNAVAILABLE",
      statusCode: 502,
      message: "Discord is temporarily unavailable. Try again shortly.",
    };
  if (details.status === undefined)
    return {
      ...details,
      code: "DISCORD_UNREACHABLE",
      statusCode: 502,
      message: "Unable to reach Discord. Check the connection, then retry.",
    };
  return {
    ...details,
    code: "DISCORD_REQUEST_FAILED",
    statusCode: 502,
    message:
      "Discord rejected the request. Check the bot configuration, then retry.",
  };
}

/** Discord's JSON error codes that say which of the two 4xx families a refusal is. */
const missingAccess = 50001;
const missingPermissions = 50013;
const unknownChannel = 10003;
/** Failures that happen before anything leaves this machine, so nothing can have been posted. */
const neverSent = new Set<string | number>([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

/**
 * What a failed post means for one copy. Without an answer from Discord the
 * message may still have been created, so that outcome is `unknown` and not
 * retried unseen; `stop` ends the whole send, since every later post would be
 * refused the same way.
 */
export function deliveryFailure(error: unknown): {
  code: DeliveryErrorCode;
  outcome: "failed" | "unknown";
  stop: boolean;
} {
  const { status, causeCode } = safeErrorDetails(error);
  const failed = (code: DeliveryErrorCode, stop = false) => ({
    code,
    outcome: "failed" as const,
    stop,
  });
  if (error instanceof RateLimitError || status === 429)
    return failed("RATE_LIMITED");
  if (status === 401) return failed("INVALID_TOKEN", true);
  if (
    status === 403 ||
    causeCode === missingPermissions ||
    causeCode === missingAccess
  )
    return failed("MISSING_PERMISSION");
  if (status === 404 || causeCode === unknownChannel)
    return failed("CHANNEL_GONE");
  // A 500 or 504 can come after Discord stored the message; 502 and 503 mean it never got that far.
  if (status === 500 || status === 504)
    return { code: "UNKNOWN_OUTCOME", outcome: "unknown", stop: false };
  if (status !== undefined && status >= 500)
    return failed("DISCORD_UNAVAILABLE");
  if (status !== undefined) return failed("INVALID_PAYLOAD");
  if (causeCode !== undefined && neverSent.has(causeCode))
    return failed("UNREACHABLE");
  return { code: "UNKNOWN_OUTCOME", outcome: "unknown", stop: false };
}

export class StartupError extends Error {
  constructor(
    public readonly stage: "database" | "migration" | "listen",
    cause: unknown,
  ) {
    super(
      {
        database:
          "Startup failed: cannot open SQLite in DATA_DIR. Check directory permissions and disk space.",
        migration:
          "Startup failed: SQLite migration failed. Check the database and migration files.",
        listen:
          "Startup failed: cannot listen on HOST and PORT. Check whether the port is in use and the address is available.",
      }[stage],
      { cause },
    );
  }
}

export function startupFailure(error: unknown) {
  return {
    message:
      error instanceof StartupError
        ? error.message
        : "Startup failed while initializing the application.",
    stage: error instanceof StartupError ? error.stage : "application",
    ...safeErrorDetails(error),
  };
}
