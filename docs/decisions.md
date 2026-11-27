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

- **Edit runs have durable client IDs.** Repeated update requests return the recorded run; copies keep their original message IDs, and interrupted requests remain unconfirmed until an operator checks Discord.
- **Attachment retention follows Discord IDs.** Each edit records which upload IDs were kept. Before patching a copy, match those files to its Discord attachment IDs; replacement uploads get new IDs even when their filenames match.
- **Destinations and mention settings stay fixed during edits.** Only existing copies are patched; deleted copies are recorded permanently and excluded from retries.
- **The editor protects unsaved work.** Route navigation and browser unload ask before discarding changes, while the ordinary composition draft stays separate.
- **Templates hold on to their files.** The upload sweep and a draft's clear skip any file a template names, as they already did for sends; saving keeps only files the server still has, and a file lost anyway (a wiped data directory) is flagged on the template and in the composer when a message is started from it.

