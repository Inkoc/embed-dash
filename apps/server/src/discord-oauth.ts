import { sessionUserSchema, type SessionUser } from "@embed-dash/shared";
import type { Config, DiscordLoginConfig } from "./config.js";

export const oauthScope = "identify";
const timeout = 5000;
/** Sign-in waits for the revoke, so an unresponsive Discord may hold it only briefly. */
export const revokeTimeout = 2000;

/** Carries only the failing step: upstream bodies and messages can hold credentials. */
export class OAuthError extends Error {
  constructor(
    public readonly stage: "token" | "user" | "revoke",
    cause?: unknown,
    public readonly status?: number,
  ) {
    super(`Discord OAuth ${stage} request failed`, { cause });
  }
}

export const redirectUri = (publicUrl: string) =>
  `${publicUrl}/api/auth/discord/callback`;

/** Discord serves the consent page beside its API, not under it. */
export function authorizeUrl(
  config: Pick<Config, "discordApiBase"> & {
    discordLogin: DiscordLoginConfig;
    publicUrl: string;
  },
  state: string,
) {
  const url = new URL("/oauth2/authorize", config.discordApiBase);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.discordLogin.clientId,
    scope: oauthScope,
    state,
    redirect_uri: redirectUri(config.publicUrl),
  }).toString();
  return url.toString();
}

async function request(
  stage: "token" | "user" | "revoke",
  url: string,
  init: RequestInit,
) {
  let response: Response;
  try {
    // A redirect would replay the client secret or bearer token to another host.
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(stage === "revoke" ? revokeTimeout : timeout),
    });
  } catch (error) {
    throw new OAuthError(stage, error);
  }
  if (!response.ok) throw new OAuthError(stage, undefined, response.status);
  // Revoking answers with an empty body that nothing reads.
  if (stage === "revoke") return {};
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    throw new OAuthError(stage, error);
  }
}

/**
 * Trades the authorization code for the user's identity, then has Discord end
 * the authorization (revoking either token ends both). The tokens live only
 * inside this call and are never returned.
 */
export async function fetchDiscordUser(
  config: Config & { discordLogin: DiscordLoginConfig; publicUrl: string },
  code: string,
  onRevokeFailure: (error: OAuthError) => void,
): Promise<SessionUser> {
  const { discordLogin: login } = config;
  const credentials = {
    client_id: login.clientId,
    client_secret: login.clientSecret,
  };
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
        ...credentials,
      }),
    },
  );
  const revocable =
    typeof token.access_token === "string"
      ? { token: token.access_token, hint: "access_token" }
      : typeof token.refresh_token === "string"
        ? { token: token.refresh_token, hint: "refresh_token" }
        : undefined;
  try {
    const granted =
      typeof token.scope === "string" ? token.scope.split(" ") : [];
    if (typeof token.access_token !== "string" || !granted.includes(oauthScope))
      throw new OAuthError("token");
    const user = await request(
      "user",
      `${config.discordApiBase}/v10/users/@me`,
      { headers: { authorization: `Bearer ${token.access_token}` } },
    );
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
  } finally {
    // Runs for refused accounts and failed lookups too; a failure here must not
    // block anyone, so it is only reported (without the token) for the log.
    if (revocable)
      await request("revoke", `${config.discordApiBase}/oauth2/token/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: revocable.token,
          token_type_hint: revocable.hint,
          ...credentials,
        }),
      }).catch(onRevokeFailure);
  }
}
