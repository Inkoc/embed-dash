# Decisions

Choices that shaped the code, with the reason and what would change them.

## Preview markdown: discord-markdown-parser plus a list rule (27 November 2026)

**Decision.** The preview parses Discord markdown with [discord-markdown-parser](https://github.com/ItzDerock/discord-markdown-parser) 1.3.1 (Apache-2.0) and renders its syntax tree to React elements with our own renderer (`apps/web/src/preview/Markdown.tsx`). We add one rule of our own, for bulleted and numbered lists, which the package doesn't have.

**Why.** The package's grammar matched every fixture in `docs/preview-fidelity.md` except lists: inline styles, code, quotes, masked links, headings, subtext, spoilers, escapes, mentions with real 17 to 20 digit IDs, custom emoji and timestamps. The list gap was small and could be fixed with an extra rule, so a custom parser, with its grammar and security upkeep, wasn't justified. Discord's restricted embed parts (title, field names) use a subset of the package's rules; author and footer aren't parsed at all.

**Safety.** The package only produces a tree; nothing it parses becomes HTML. Link targets come through unfiltered (`javascript:` included), so the renderer turns only `http:` and `https:` targets into links and shows anything else as typed.

**Revisit if** a client check finds behaviour the package's rules can't express, or the package stops being maintained.

## Milestone 1 (27 November 2026)

One line per decision that shaped M1; the PRs hold the detail.

- **Discord REST only, no Gateway.** Listing servers and channels and posting need no Gateway connection or privileged intents.
- **Three access modes.** `none` answers only loopback hosts and shows a permanent warning; `password` uses Argon2id with a rate limit; `discord` asks for the `identify` scope only, checks an allowlist on every request and revokes Discord's tokens right after the user lookup.
- **Sessions.** Only a SHA-256 hash of the session id is stored; nothing is written before sign-in; every state-changing request needs a CSRF token and a same-origin request.
- **Uploads.** Stored under generated names; only sniffed raster images are served back, behind the session, with `nosniff`. Files a send refers to are kept; files only a draft uses are removed after `UPLOAD_RETENTION_DAYS` (default 14).
- **Sending runs in the background.** `POST /api/sends` stores the send and answers `202`; the browser follows it by id. A client-chosen id makes a repeated request return the same send, so a dropped connection can't post twice.
- **Each post is marked before it goes out.** After a crash only that target is unconfirmed; untouched targets stay retryable. Unconfirmed targets are never retried automatically.
- **Main channel of a server** is its system channel, else its first postable announcement channel, else its first postable text channel.
- **Forum channels are listed but not selectable** until forum posting exists.
- **`@fastify/static` upgraded to 11.0.0** to clear a path-traversal advisory found by the milestone audit. The one remaining advisory is development-only (an `esbuild` copy inside `drizzle-kit`, whose dev server this project never runs).

## Milestone 2

- **Edit runs have durable client IDs.** Repeated save requests return the recorded run; retry uses the current send and failed copies without creating another run; copies keep their original message IDs. Interrupted edits become retryable failures because a full-state PATCH cannot create a duplicate message; interrupted posts retain their unconfirmed delivery status.
- **Attachment retention follows Discord IDs.** Create and edit responses persist each copy’s Discord attachment IDs, filenames and upload IDs. Kept files use those IDs without fetching the message or re-reading disk; replacement uploads get new IDs even when filenames match.
- **Destinations and mention settings stay fixed during edits.** Only existing copies are patched; deleted copies are recorded permanently and excluded from retries.
- **The editor protects unsaved work.** Route navigation and browser unload ask before discarding changes, while the ordinary composition draft stays separate.
- **Templates hold on to their files.** The upload sweep and a draft's clear skip any file a template names, as they already did for sends; saving keeps only files the server still has, and a file lost anyway (a wiped data directory) is flagged on the template and in the composer when a message is started from it.
- **Legacy copies re-upload retained files on their first edit.** Copies without stored Discord attachment IDs send an explicit replacement attachment list from the retained local uploads. Missing required uploads refuse the edit before any copy changes; the operator can remove or replace them. This avoids requesting Read Message History and never silently drops a retained file.
- **Delivery and edit outcomes are independent.** History filters use the original delivery status; edit results use separate fields and list only existing copies. Undelivered copies stay retryable as sends of the current payload, and a shared transaction lock excludes overlapping sends, retries and edits.
- **Edit mode has one primary action.** The composer’s desktop action and mobile sticky action save updates directly; the edit heading names the message and fixed destinations, and closing restores the earlier draft.
- **Update failures stay visible after closing the editor.** History shows update attention separately from delivery status, and reopening restores only unfinished copies from the last run; retries apply the saved version without changing the delivery record.
- **History search is case-insensitive in any script.** Searchable text is stored lowercased (Unicode-aware) when a send is recorded, existing rows were backfilled by migration, and the send creation time is indexed; a leading `#` is ignored, as in the channel picker.
- **History shows local time with the zone named.** The browser turns date filters into exact local-midnight bounds, so a send just after midnight lands on the day the operator expects.
- **Message JSON follows Discord's message object.** Empty values written by common community builders (`null` content, embeds or colour, empty attachment lists) are treated as absent; anything the composer can't hold, including link buttons for now, is listed instead of dropped; uploaded files are never exported.
- **Empty embeds never leave the composer.** An embed with no content is left out of every send, edit, template and export, however it was created.
- **Failures read as sentences.** One client mapping turns server and Discord errors into specific copy, with status and code behind a Details disclosure; a refused sign-in behind an unconfigured HTTPS proxy names the settings to set.
- **The top bar holds four views.** Below about 640 px the views move to their own row; at larger text sizes the bar sheds the brand name, then the bot name, one step at a time. Layout breakpoints are in em so they follow the browser's text size.
- **Dependency audit (milestone 2).** Production dependencies have no known advisories; the one remaining moderate advisory is in a build-time tool used only to generate migrations and was accepted again.

## Milestone 3

- **Scheduling uses the delivery engine.** UTC due instants live on sends; each timer tick claims due rows in a SQLite transaction before invoking ordinary delivery. A one-second timer also picks up overdue entries after startup.
- **Scheduled targets have not started.** Restart settlement excludes them; claimed deliveries retain the existing posting/unknown recovery rules and never repost uncertain copies automatically.
- **Schedules remain mutable until claimed.** Content, due time and destinations change together under the same transaction lock; cancellation excludes the payload from upload retention while completed deliveries retain files for retries.
- **Scheduler tests control time without production endpoints.** Integration tests inject a clock; only the fake-Discord e2e harness exposes an authenticated, CSRF-protected one-minute advance endpoint and uses a 50 ms tick.
- **A scheduled send takes its send time when claimed.** Delivery, subsequent edits and retries, previews and history bounds share that persisted instant; the Scheduled filter orders waiting entries by due time.
- **Listing outages have a bounded delay.** Scheduler listing failures log fixed codes and back off from five seconds to one minute. Permanent refusals fail immediately; transient failures fail entries after fifteen minutes overdue, allowing an explicit retry.
- **Plans extend at most one year ahead.** Shared validation and the browser enforce a 365-day horizon; missing scheduled files produce an explicit upload failure before posting.
