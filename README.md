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
comma-separated list of the addresses the proxy connects from, as IPs or CIDR
ranges. Only those peers may supply forwarded client IPs and protocol. With
Compose, the container sees the proxy at a Docker network address, not
`127.0.0.1`: whether the proxy runs on the host (through the published port, via
the network's gateway) or in a container on the same network. That address can
change when the network is recreated, so trust the network's subnet. `docker
network inspect <project>_default --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'`
prints it, where `<project>` is the Compose project name (the checkout's folder
name by default); for example `TRUST_PROXY=172.18.0.0/16`. Without Docker, a proxy on the
same machine is `127.0.0.1,::1`.
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

E2E uses password mode by default and a fake Discord API on an ephemeral port;
a second instance in Discord login mode runs on the next port up (`E2E_PORT + 1`).
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
file. Compose passes `PUBLIC_URL` through from the shell; the value must be an
HTTP(S) origin without credentials or a path.
Pre-login session checks use an HttpOnly CSRF cookie and do not create database
rows. Authenticated session identifiers are stored as SHA-256 hashes.

## Uploaded files

Files attached in the composer are stored under `DATA_DIR/uploads`, up to
`MAX_UPLOAD_MB` each (default 10). A file that a send uses is kept, so a failed
channel can be retried later. A file only a draft uses is kept for
`UPLOAD_RETENTION_DAYS` (default 14, a whole number of days); after that the
composer shows it as no longer on the server and asks for it again. Clear draft
deletes the draft's files at once, apart from any a send still uses.

## Sign in with Discord

`AUTH_MODE=discord` lets a team share one instance: people sign in with their
Discord account, and only the accounts you list get in. There is no instance
password in this mode.

1. In the [Discord developer portal](https://discord.com/developers/applications),
   open an application (the bot's, or a separate one) and go to **OAuth2**. Copy
   the **Client ID** and **Client secret**.
2. Under **Redirects**, add `<PUBLIC_URL>/api/auth/discord/callback`, for example
   `https://embed.example/api/auth/discord/callback`. It must match exactly:
   the server builds the redirect address from `PUBLIC_URL`, which is the
   address people type in the browser (an origin, no path). Use HTTPS for
   anything beyond your own machine.
3. Save the client secret in `secrets/discord_client_secret.txt`. With Compose,
   set `DISCORD_CLIENT_SECRET_SOURCE=./secrets/discord_client_secret.txt` so the
   file is mounted as the `discord_client_secret` secret (it is optional in the
   other modes).
4. List the approved accounts in `ALLOWED_USER_IDS`, comma-separated. In
   Discord, turn on Developer Mode (Settings → Advanced), then right-click a
   profile and choose **Copy User ID**. People who are not listed see a "Not
   allowed" screen with their own user ID to send to you.

```sh
AUTH_MODE=discord PUBLIC_URL=https://embed.example \
  DISCORD_CLIENT_ID=123456789012345678 \
  ALLOWED_USER_IDS=111111111111111111,222222222222222222 \
  DISCORD_CLIENT_SECRET_SOURCE=./secrets/discord_client_secret.txt \
  docker compose up --build
```

Outside Compose use `DISCORD_CLIENT_SECRET_FILE` (or `DISCORD_CLIENT_SECRET`;
the file takes precedence). A missing or invalid value stops startup with a
message naming the variable. The allowlist is read at startup: after you change
it, restart, and anyone you removed is signed out because their sessions stop
being accepted. Start sign-in from the `PUBLIC_URL` address; the browser keeps
the sign-in state per host, so starting from another address ends in an
"expired" message.

### What the `identify` scope can and cannot do

The instance asks Discord for the `identify` scope and nothing else. That lets
it read who the signed-in person is: their user ID, username, display name,
avatar and similar public profile fields. It cannot read their email address,
servers, friends, messages or direct messages; it cannot post, join servers or
change anything on their account.

The instance keeps only the user ID, display name and avatar address for the
12-hour session. Discord's access and refresh tokens are used once, during
sign-in, to read the profile; they are never written to the database or logs.
Right after the profile is read, the server asks Discord to revoke them, which
ends the whole authorization, so the account no longer lists the app under
**User Settings → Authorized Apps**. This also happens for accounts that are
refused. The revoke is best-effort: if Discord cannot be reached the sign-in
still completes, the failure is logged (status only, never the token), and the
person can remove the app from Authorized Apps themselves. Anyone who runs an
instance (or modifies its code) could capture the token during the moment it is
valid, so sign in only to instances run by people you trust; with `identify`,
the most that token can do is read the same profile.

Each sign-in attempt carries a random `state` that is bound to the browser that
started it, works once and expires after 10 minutes, so a callback link opened
elsewhere or replayed is rejected. The authorization code is exchanged with the
client secret; PKCE is not used.
