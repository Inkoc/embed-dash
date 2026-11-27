<img src="assets/icon.svg" width="64" height="64" alt="">

# embed-dash

A self-hosted web app for building Discord embeds with a pixel-accurate live preview and sending them through your own bot. Pick channels across every server the bot is in, send to many at once, and keep a searchable history so sent messages can be edited later. Runs as a single Docker container with `docker compose`.

## Setup

Install Docker with Compose. Create `secrets/bot_token.txt` containing your Discord bot token and `secrets/admin_password.txt` containing a strong instance password (one line each); this file stays outside version control. Compose file secrets retain host permissions: make it readable by container uid 1000 with `chmod 644 secrets/bot_token.txt secrets/admin_password.txt`, or assign ownership to uid 1000 and keep restrictive permissions. Then run:

```sh
mkdir -p secrets
# Create both secret files with your editor before starting.
docker compose up --build
```

Open <http://127.0.0.1:8742>. The composer opens with an illustrative example embed and a live Discord-style preview; the top bar shows which bot is connected. Sending to channels is not available yet. Sign in with the instance password. SQLite lives in the named `embed-data` volume and migrations run at startup. Stop with `docker compose down`; the volume persists.

### Development

Install [mise](https://mise.jdx.dev/) and a C++ build toolchain (Python 3, make and a C++ compiler) if a SQLite prebuild is unavailable. On Ubuntu: `sudo apt-get install python3 make g++`.

```sh
mise install && pnpm install
BOT_TOKEN_FILE=./secrets/bot_token.txt ADMIN_PASSWORD_FILE=./secrets/admin_password.txt DATA_DIR=./data pnpm dev
```

Open the Vite URL printed in the terminal (normally <http://localhost:5173>). Vite binds to `127.0.0.1` and proxies `/api` to the server on port 8742. Run the command from the repository root: relative secret and data paths resolve against pnpm's invoking directory (`INIT_CWD`), or the process working directory outside pnpm. The server defaults to `HOST=127.0.0.1`; Docker sets `HOST=0.0.0.0` inside the container while Compose publishes only on localhost. Environment variables are read at startup; `.env.example` documents them, and `.env` files are not loaded automatically. Compose mounts the secret and sets its own configuration.

```sh
pnpm test
pnpm test:coverage
pnpm lint
pnpm format:check
pnpm typecheck
pnpm exec playwright install --with-deps chromium
pnpm e2e
pnpm build
bash scripts/ci.sh
```

`pnpm format` applies formatting. E2E builds and starts the real app with a local fake Discord API; no real token or Discord request is needed. Coverage reports default to gitignored `coverage/` (`COVERAGE_DIR` overrides it); Playwright outputs default to gitignored `test-results/` (`PLAYWRIGHT_OUTPUT_DIR` overrides it). Tests do not capture screenshots. Take manual verification screenshots under `~/forge-artifacts/embed-dash/`.

The visual design system is described in [DESIGN.md](DESIGN.md), and bundled fonts and icons with their licences in [docs/assets.md](docs/assets.md). To serve a production build outside Docker, run `NODE_ENV=production BOT_TOKEN_FILE=./secrets/bot_token.txt ADMIN_PASSWORD_FILE=./secrets/admin_password.txt DATA_DIR=./data node apps/server/dist/index.js` after `pnpm build`.

Dependencies are locked. TypeScript 6.0.3 is retained for typescript-eslint's supported range; the other adopted packages use compatible current releases. The project is licensed under [AGPL-3.0](LICENSE).

Generate SQLite migrations with `pnpm --filter @embed-dash/server db:generate` after editing `apps/server/src/schema.ts`. The generated initial migration includes a snapshot; its journal timestamp retains the original baseline value so existing databases do not apply the equivalent initial table twice.

## Access control and ports

`AUTH_MODE=password` is the default. Set `ADMIN_PASSWORD_FILE` to a readable
secret file, or use `ADMIN_PASSWORD`; the file takes precedence. Passwords are
hashed with Argon2id at startup. Login allows five attempts per minute per client address. With proxy trust off,
this is the connection address, so clients behind a proxy share its budget.
Sessions persist in SQLite for 12 hours, rotate on login and are removed on
sign out. Cookies are HttpOnly and SameSite=Lax, with Secure enabled for HTTPS.
Proxy trust defaults to off (`TRUST_PROXY=off`). Set `TRUST_PROXY` to a
comma-separated list of the proxy connection IPs (for example
`127.0.0.1,::1`). Only those peers may supply forwarded client IPs and protocol.
The proxy must replace `X-Forwarded-For` and `X-Forwarded-Proto`, and direct
backend access must be blocked. Trusted forwarded client addresses receive
separate login budgets. Cookies use Secure only when the trusted request
protocol is HTTPS. Use HTTPS for remote deployments.

`AUTH_MODE=none` skips login and displays a permanent access warning. Anyone
who can reach the instance can use its bot, so keep the published address on
`127.0.0.1`, including when using Docker. Do not expose this mode to your LAN
or the internet. Invalid modes fail startup.

`PORT` sets the server listening port (default 8742). Compose maps
`127.0.0.1:8742:8742`; change the host port on the left to publish elsewhere.
If changing the container port, also update its environment, mapping and health
check. The development Vite proxy targets port 8742.

API clients first call `GET /api/session` to obtain a session cookie and
`csrfToken`, then include `x-csrf-token` on every state-changing request,
including login and logout. Include an `Origin` header matching the request
host and protocol (or `PUBLIC_URL` when configured); a same-origin `Referer`
is also accepted. Cross-site writes and writes with no origin metadata are
rejected. Fetch the session again after login to get the
rotated token. Responses from session and API routes are not cached.

E2E uses password mode by default and a fake Discord API on an ephemeral port.
Set `E2E_PORT` to an unused high port for concurrent test runs.

No-login mode also accepts only loopback Host names (`localhost`,
`127.0.0.1`, or `[::1]`, with an optional port) to block DNS rebinding.
Binding it to a non-loopback HOST emits a startup warning; Docker still needs
its internal all-interface binding and a loopback-only published port.

For Compose local mode without creating an admin password file, use the empty
system file as the unused secret source:

```sh
AUTH_MODE=none ADMIN_PASSWORD_SECRET_FILE=/dev/null docker compose up --build
```

The bot-token secret is still required. Password mode must use a real password
file. To set an external `PUBLIC_URL` in Compose, add it to the service's
environment; the value must be an HTTP(S) origin without credentials or a path.
Pre-login session checks use an HttpOnly CSRF cookie and do not create database
rows. Authenticated session identifiers are stored as SHA-256 hashes.

### Discord sign-in

Set `AUTH_MODE=discord`, `DISCORD_CLIENT_ID`, `PUBLIC_URL` and
`ALLOWED_USER_IDS` (comma-separated Discord user IDs, obtainable with Discord’s
Developer Mode). Supply the application’s client secret using
`DISCORD_CLIENT_SECRET_FILE`, or `DISCORD_CLIENT_SECRET`; the file takes
precedence. Missing or malformed settings stop startup. All approved users
share the instance’s bot access; there are no individual roles.

Create an application in the [Discord developer portal](https://discord.com/developers/applications).
Under OAuth2, register exactly `<PUBLIC_URL>/api/auth/discord/callback` as a
redirect URI (for example `https://embed.example/api/auth/discord/callback`).
`PUBLIC_URL` is the browser-facing HTTP(S) origin, without a path. Use HTTPS
for remote access and configure trusted proxies as described above.

For Compose, set `DISCORD_CLIENT_SECRET_SOURCE=./secrets/discord_client_secret.txt`
to mount the optional `discord_client_secret` secret. Create that file with the
same ownership/readability rules as the bot secret. Compose uses `/dev/null`
for this secret outside Discord mode. Set `ADMIN_PASSWORD_SECRET_FILE=/dev/null`
when using Discord mode without a password file. Compose passes `PUBLIC_URL`,
`DISCORD_CLIENT_ID` and `ALLOWED_USER_IDS` through to the service.

Only the [`identify` scope](https://docs.discord.com/developers/topics/oauth2#shared-resources-oauth2-scopes)
is requested: it reads basic profile information (ID, name and avatar). It
does not grant access to email, private messages, server membership or account
management, and cannot send messages as the person signing in. Posting uses
the instance’s separately configured bot. Access and refresh tokens exist only
in memory during login and are discarded after the profile lookup; they are
never stored or logged. Sessions retain identity details only. The avatar is
loaded from Discord’s CDN; the app remains usable if that image is unavailable.

Sign-in uses authorization codes with S256 PKCE and browser-bound, single-use
state that expires after five minutes. Restarting the server clears pending
sign-ins; start again if an attempt expires. The callback is a GET navigation
from Discord and uses state for CSRF defence; write routes still require the
usual origin and CSRF checks. Unapproved accounts see their ID and instructions
for contacting the operator. Removing an ID from configuration and restarting
also blocks its existing sessions.

For local fake-provider tests, `DISCORD_API_BASE` controls token exchange
(`/oauth2/token`) and identity (`/users/@me`); `DISCORD_AUTHORIZE_URL` overrides
the authorization URL. Leave both at their Discord defaults in production.
