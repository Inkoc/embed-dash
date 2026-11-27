# embed-dash — product spec

## Summary

embed-dash is a self-hosted web app for composing Discord messages with rich embeds, previewing them as Discord renders them, and sending them through the operator's own bot to any number of channels across the servers that bot belongs to. Every send is recorded, so a message that went to many channels can be found later and edited in all of them at once. It ships as one Docker container started with `docker compose up`.

## Users

- **Server operators and community managers** who run one or more Discord servers and post announcements, rules, role menus and event notices as embeds.
- They host the app themselves (home server, VPS, NAS) and own the bot. One instance serves one bot token; a few trusted people may share an instance.

## Core flows

1. **Compose.** Write message content and up to 10 embeds (author, title, URL, description, colour, fields, image, thumbnail, footer, timestamp). Every Discord limit is counted live and violations block sending with a specific message.
2. **Preview.** A live preview beside the editor (stacked on small screens) renders the message the way the Discord client shows it: colour bar, inline field rows, thumbnail and image placement, and Discord-flavoured markdown per field.
3. **Attach.** Add links, image URLs and uploaded files; uploaded images can be used as the embed image or thumbnail.
4. **Pick channels.** Browse every text channel the bot can reach, grouped by server; search by channel name, server name or ID; select several. Channels where the bot lacks permission to post are marked and cannot be selected.
5. **Send.** One action sends to every selected channel and shows a result per channel (sent / failed with the reason), with retry for failures.
6. **Find and edit.** History lists past sends, searchable by text, server, channel and date. Opening one loads it into the composer; saving updates every copy and reports per-channel results.
7. **Reuse.** Save the composer as a named template; start from a template; import and export message JSON.
8. **Schedule.** Choose a date and time instead of sending now; scheduled sends can be listed, edited and cancelled and survive restarts.

## Features by milestone

### M0 — Baseline
- App runs with `docker compose up` on port 8742, reads the bot token from a Compose secret and shows which bot it is connected to.
- The composer screen exists in the chosen visual direction, with dark and light themes (system preference by default, switchable and remembered).

### M1 — Compose, preview, pick, send (core actions)
- Embed editor covering every embed property, multiple embeds, live limit counters and validation.
- Accurate live preview with Discord markdown, mention/timestamp rendering and field layout; dark and light preview themes.
- Attachments: links, image URLs and file uploads with `attachment://` usage and size limits.
- Channel picker: grouped by server, search (name / server / ID), multiselect, permission pre-check.
- Send to many channels with per-channel results and retry. Mentions never ping unless explicitly enabled; optional silent send.
- Access control: `password` mode and `none` mode (local use, persistent warning); basic configuration (port and the rest via environment).
- Access control: `discord` mode — sign in with Discord, restricted to an allowlist of user IDs.

### M2 — History and reuse
- Sent history with search and filters.
- Edit a sent message across all of its copies.
- Templates: save, load, rename, delete.
- JSON import/export compatible with the Discohook message format.

### M3 — Scheduling and extras
- Scheduled sends.
- Saved channel groups.
- Link buttons.
- Forum channels (post as a new thread) and announcement channels (optional publish to followers).

## Preview accuracy

"Accurate" means: the same limits as Discord, the same markdown support per embed surface (rich in description and field values; restricted in title, author, footer and field names), the same field-row layout including the thumbnail case, and the same placement of media. It is measured against the current Discord desktop client in its dark and light themes. The preview uses an open-licence lookalike font and no Discord logos, so it is visually close, not pixel-identical.

## Security requirements

- The bot token is read from a mounted secret file (environment fallback), stays on the server, and never appears in responses, logs, exports or the client bundle.
- Auth modes: `none` (all access; for local use only, the Compose example binds to 127.0.0.1 and the UI shows a permanent warning), `password` (Argon2id, rate-limited), `discord` (OAuth with the `identify` scope only; the user ID is checked against an allowlist and Discord tokens are discarded right after login).
- Server-side sessions in `HttpOnly`, `SameSite=Lax` cookies; CSRF protection on every state-changing request.
- Media URLs are passed to Discord, never fetched by the server. Uploads are size-limited and stored under generated names.

## Non-goals

- Multiple bot tokens per instance, or multi-tenant hosting.
- Webhook sending, a Discord Gateway connection, or reacting to Discord events (role menus with interactions, slash commands).
- Components V2, polls, select menus and interactive buttons (only link buttons).
- Recurring (cron) schedules; scheduled sends are one-off.
- Pixel-perfect reproduction of the Discord client, Discord fonts or logos.
- Hosting user media for third parties.
