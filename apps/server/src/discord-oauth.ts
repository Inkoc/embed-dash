import { sessionUserSchema, type SessionUser } from "@embed-dash/shared";
import type { Config, DiscordLoginConfig } from "./config.js";

export const oauthScope = "identify";
const timeout = 5000;

/** Carries only the failing step: upstream bodies and messages can hold credentials. */
export class OAuthError extends Error {
  constructor(
    public readonly stage: "token" | "user",
    cause?: unknown,
    public readonly status?: number,
  ) {
    super(`Discord OAuth ${stage} request failed`, { cause });
  }
}

export const redirectUri = (publicUrl: string) =>
  `${publicUrl}/api/auth/discord/callback`;

export function authorizeUrl(
  login: DiscordLoginConfig,
  publicUrl: string,
  state: string,
) {
  const url = new URL(login.authorizeUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: login.clientId,
    scope: oauthScope,
    state,
    redirect_uri: redirectUri(publicUrl),
  }).toString();
  return url.toString();
}

async function request(
  stage: "token" | "user",
  url: string,
  init: RequestInit,
) {
  let response: Response;
  try {
    // A redirect would replay the client secret or bearer token to another host.
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    throw new OAuthError(stage, error);
  }
  if (!response.ok) throw new OAuthError(stage, undefined, response.status);
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    throw new OAuthError(stage, error);
  }
}

/**
 * Trades the authorization code for the user's identity. The Discord access
 * and refresh tokens live only inside this call and are never returned.
 */
export async function fetchDiscordUser(
  config: Config & { discordLogin: DiscordLoginConfig; publicUrl: string },
  code: string,
): Promise<SessionUser> {
  const { discordLogin: login } = config;
  const token = await request(
    "token",
    `${config.discordApiBase}/oauth2/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(config.publicUrl),
        client_id: login.clientId,
        client_secret: login.clientSecret,
      }),
    },
  );
  const granted = typeof token.scope === "string" ? token.scope.split(" ") : [];
  if (typeof token.access_token !== "string" || !granted.includes(oauthScope))
    throw new OAuthError("token");
  const user = await request("user", `${config.discordApiBase}/v10/users/@me`, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const name =
    typeof user.global_name === "string" && user.global_name
      ? user.global_name
      : user.username;
  const avatar =
    typeof user.avatar === "string" &&
    /^(?:a_)?[0-9a-f]{1,40}$/.test(user.avatar)
      ? `https://cdn.discordapp.com/avatars/${String(user.id)}/${user.avatar}.png`
      : null;
  const parsed = sessionUserSchema.safeParse({
    id: user.id,
    name,
    avatarUrl: avatar,
  });
  if (!parsed.success) throw new OAuthError("user");
  return parsed.data;
}
