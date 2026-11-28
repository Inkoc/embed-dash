# embed-dash — architecture

The simplest design that meets [the spec](spec.md): one Node process serving a React SPA and a JSON API, SQLite on a volume, Discord REST only. Research and version notes: [docs/research/stack.md](research/stack.md).

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node 26 LTS, pnpm workspaces | One runtime for web build and server; pinned in `mise.toml` |
| Frontend | React 19 + TypeScript, Vite, React Router, TanStack Query | Small SPA; Query caches server data, the composer draft stays local |
| Styling | CSS Modules + CSS custom properties (tokens in `apps/web/src/styles/tokens.css`), Radix primitives for dialogs/popovers only | Scoped styles, no utility vocabulary, accessible overlays |
| Validation | Zod 4 in `packages/shared` | One schema for the composer, the API boundary and Discord limits |
| Markdown preview | `discord-markdown-parser` → React elements (never raw HTML) | AST output with an embed mode; replaced only if fixtures expose a gap |
| Server | Fastify 5 (+ `@fastify/static`, `@fastify/multipart`, `@fastify/cookie`) | Mature plugins, schema-based routes |
| Discord | `@discordjs/rest` + `discord-api-types` | REST client with bucket-aware rate limiting; no Gateway |
| Database | SQLite via `better-sqlite3` + Drizzle ORM, migrations with drizzle-kit | Typed SQL, one file on the `/data` volume |
| Passwords | `@node-rs/argon2` (Argon2id) | Prebuilt binaries, no build toolchain |
| Tests | Vitest (unit/integration), Playwright (e2e), ESLint flat config + typescript-eslint, Prettier | |
| Container | Multi-stage Dockerfile on `node:26-slim`, non-root user, `/data` volume, `/health` healthcheck | glibc keeps native prebuilds simple |

## Layout

```
apps/web/        React SPA (routes: /, /history, /history/:id, /templates, /login)
apps/server/     Fastify app: config, auth, discord client, routes, scheduler, db
packages/shared/ Zod schemas, Discord limits, types shared by web and server
e2e/             Playwright specs + a fake Discord API used in tests
compose.yml, Dockerfile, scripts/ci.sh
```

## Modules (server)

- **config** — reads environment once at startup, resolves `*_FILE` secrets, fails fast with a clear message on invalid config.
- **discord** — wraps `@discordjs/rest`: bot identity, guilds + channels (cached ~60 s, refreshable), effective permission computation, create/edit message (multipart), forum thread create, crosspost. Base URL is configurable so tests run against a fake Discord.
- **auth** — mode `none` | `password` | `discord`; sessions table; CSRF (double-submit token header) on non-GET routes; login rate limit. Discord mode runs the OAuth authorization-code flow (`identify` only, `state` bound to the browser by a cookie, single-use, 10-minute expiry), checks the user ID against the allowlist, then revokes the Discord tokens at Discord and discards them; only the ID, display name and avatar address are kept in the session. The callback is a GET navigation, so `state` replaces the origin/CSRF checks there.
- **sends** — validates payload with the shared schema, checks attachments against the stored upload records and each channel against the current guild listing, stores the send and one target row per channel, answers `202` as soon as the send and its targets are stored, then delivers sequentially through the rate-limited client in the same process and records each target as it completes (short 429s are waited out a few times, long or repeated ones fail that channel; a 401 ends the send; three refusals in a row from one server skip its remaining channels; two sends to one channel take turns, so each post has its own 429 budget). Just before a target's request goes out it is marked `posting`. Targets left `posting` by a restart become `unknown` (the post may have arrived); targets left `pending` were never attempted and become `failed` with `NOT_ATTEMPTED`, so retry can pick them up. A graceful stop lets the post in flight finish, starts no more and records the remaining targets the same way. Two requests with the same send id that race on the insert both get that send back, and only the first delivers. retry and edit operate on target rows. A post that got no answer, or a Discord 500 or 504, is `unknown`, not `failed`, because it may have been created.
- **scheduler** (M3) — a timer that claims due sends in a transaction and hands them to **sends**. A target whose outcome is unknown after a crash is marked `unknown`, not retried automatically.
- **uploads** — multipart upload to `/data/uploads/<uuid>`, streamed to disk (never buffered) and refused as soon as the declared length or the stream passes `MAX_UPLOAD_MB`; the filename is sanitised with the shared rule and the content type is sniffed from the bytes, not taken from the client. The draft references a file by id and filename; the payload says `attachment://<filename>`. The per-message limits (10 files, 25 MB together, unique names) are checked in the browser and by the shared message validation. Clearing the draft deletes its files, except any that a stored send names: a retry posts them again, so `DELETE` keeps those and only the draft lets go. An upload that finishes after a clear is deleted instead of joining the new draft. Once an hour (and at startup) files older than `UPLOAD_RETENTION_DAYS` that no stored send or template refers to are removed, along with files left without a record; a draft kept longer than that shows them as missing. Files a send or template refers to are never swept, and clearing a draft keeps them too. A failed sweep is logged and tried again an hour later.

## Data model

| Table | Columns (main) |
|---|---|
| `sends` | id, payload_json, search_text, status (`draft` `scheduled` `sending` `done` `partial` `failed` `cancelled`), scheduled_at, created_at, updated_at |
| `send_targets` | id, send_id → sends, guild_id, guild_name, channel_id, channel_name, message_id, status (`pending` `posting` `sent` `failed` `unknown`), error, attempted_at |
| `uploads` | id, filename, content_type, size, created_at |
| `templates` | id, name, payload_json, updated_at |
| `channel_groups` | id, name, channels_json (id, name, guild id and guild name per channel, as when saved), updated_at |
| `sessions` | id (SHA-256 of the cookie value), subject (`password` / `discord:<user id>`), user_name and user_avatar_url (Discord only), csrf_token, expires_at |

`payload_json` is the shared `MessagePayload` (content, embeds, link buttons, attachment references by upload id, flags, mention settings). Guild and channel names are copied onto targets so history stays readable after channels change.

## API outline

All under `/api`, JSON, session cookie + `x-csrf-token` on non-GET.

| Method + path | Purpose |
|---|---|
| `GET /health` | Liveness (no auth) |
| `GET /api/session` | Auth mode, signed-in `user` (Discord mode), `deniedUserId` after a refused sign-in, CSRF token, `insecure` flag for mode `none` |
| `POST /api/auth/login`, `POST /api/auth/logout` | Password mode |
| `GET /api/auth/discord`, `GET /api/auth/discord/callback` | Discord OAuth (`identify`, state check, allowlist) |
| `GET /api/bot` | Bot identity |
| `GET /api/guilds?refresh=1` | Guilds with text/announcement/forum channels and `canSend` flags |
| `POST /api/uploads` | Upload a file (multipart) → `{id, filename, size, contentType}` |
| `GET /api/uploads/:id`, `DELETE /api/uploads/:id` | A stored file's details (404 once gone, so the composer can mark it missing); remove it |
| `GET /api/uploads/:id/content` | An uploaded image, for the preview after a reload; 404 for every other type |
| `POST /api/sends` | `{id, payload, channelIds}` (`id` is a UUID the browser chooses; `payload` is the message plus `pings` and `silent`) → `202 {id}` once the send and its targets are stored as `pending`; delivery continues in the background. The same `id` again returns the existing send and posts nothing. `422` when the message or a stored upload fails the checks, `409` when a channel is gone, closed to the bot or a forum; nothing is stored or sent in either case |
| `GET /api/sends?q=&guildId=&channelId=&from=&to=&status=&cursor=` | History |
| `GET /api/sends/:id` | One send with its targets in the operator's order and each target's status; the browser polls it while any target is `pending` or `posting` |
| `POST /api/sends/:id/retry` | `{targetIds?}` → `202 {id}`; the failed targets (all, or the listed ones) go back to `pending` and are re-delivered in the background, then polled like a new send. `409` while the send is still being delivered (checked inside the claim, so two retries can't both start); targets with an unknown outcome are never retried |
| `PUT /api/sends/:id` | Edit payload; updates every sent copy (or reschedules) |
| `DELETE /api/sends/:id` | Cancel a scheduled send |
| `GET /api/templates`, `GET /api/templates/:id` | Templates, most recently updated first: `{id, name, updatedAt, message, missingFiles}`; `missingFiles` lists the ids of files the server no longer has |
| `POST /api/templates`, `PATCH /api/templates/:id`, `DELETE /api/templates/:id` | Save `{name, message}`; rename and/or overwrite `{name?, message?}`; delete. The message is a draft (it may still break a Discord limit); only files the server still has are kept |
| `GET /api/channel-groups` | Groups by name: `{id, name, updatedAt, channels: [{id, name, guildId, guildName}]}`. The browser checks each channel against the listing it shows, so availability follows Refresh |
| `POST /api/channel-groups`, `PATCH /api/channel-groups/:id`, `DELETE /api/channel-groups/:id` | Save `{name, channelIds}`; rename and/or replace the channels `{name?, channelIds?}`; delete. Channels are saved only if the bot can post to them in the current listing, otherwise `409 GROUP_CHANNELS_UNAVAILABLE` names them and nothing changes. A name another group has (ignoring case and surrounding spaces) is `409 GROUP_NAME_TAKEN`; more than 500 channels is `400 TOO_MANY_GROUP_CHANNELS`; a 51st group is `409 GROUP_LIMIT_REACHED` |

JSON import/export runs in the browser; nothing about it needs the server.

## Configuration

Environment variables, documented in `.env.example`; secrets as files under `/run/secrets`.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8742` | Listening port in the container; the Compose example publishes it on `127.0.0.1:8742` |
| `AUTH_MODE` | `password` | `none` / `password` / `discord` |
| `BOT_TOKEN_FILE` (or `BOT_TOKEN`) | — | Required |
| `ADMIN_PASSWORD_FILE` (or `ADMIN_PASSWORD`) | — | Required for `password` |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET_FILE` (or `DISCORD_CLIENT_SECRET`), `PUBLIC_URL`, `ALLOWED_USER_IDS` | — | Required for `discord`; the redirect URI is `<PUBLIC_URL>/api/auth/discord/callback` |
| `DATA_DIR` | `/data` | SQLite file and uploads |
| `MAX_UPLOAD_MB` | `10` | Per file; total request capped at 25 MB |
| `UPLOAD_RETENTION_DAYS` | `14` | Days a file that no send refers to (one only a draft uses) is kept; a whole number, 1 or more |
| `DISCORD_API_BASE` | Discord's | Tests only; also serves the OAuth token, revoke and user requests, and the consent page is derived from its host |

## Key decisions

- **REST only, no Gateway.** Listing guilds/channels and sending need no Gateway connection or privileged intents; fewer moving parts.
- **One container, SQLite.** Matches the self-hosted, single-bot scope; no queue or external database.
- **Server never fetches media URLs.** Discord fetches them; avoids SSRF entirely.
- **Draft lives in the browser** (localStorage autosave) until sent or saved as a template; no drafts table.
- **Edit is per send, not per message.** One send to N channels is one history entry; editing updates all copies and shows per-copy results.
- **Uploads are untrusted.** They are stored under generated names and only images (PNG, JPEG, GIF, WebP, recognised by their first bytes; never SVG) are served back, behind the session, with `nosniff` and the sniffed type. The preview needs them after a reload, so a fresh object URL per session would not do. Nothing else is ever returned by the app origin.
- **Mentions suppressed by default** (`allowed_mentions.parse = []` on create and edit); the composer can opt in per send.
- **Delivery is sequential per send** through the client's rate limiter; parallelism is not needed for tens of channels.
- **Licence: AGPL-3.0.** Copies run as a network service with modifications must share their source, which suits a self-hosted server app.
