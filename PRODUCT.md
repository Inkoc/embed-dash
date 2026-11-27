# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + TypeScript (Vite) in the browser; a Node + TypeScript (Fastify) server; SQLite through Drizzle; Discord REST only, with no gateway connection. Everything ships as one container started with `docker compose`. Styling uses CSS Modules and custom properties, with Radix primitives only where an accessible pattern needs them. Details and alternatives are in `docs/research/stack.md`.

## Users

**Primary: the operator.** A person who runs their own Discord bot and administers one or more community servers: a guild owner, a community manager, or the moderator who looks after announcements. They are comfortable enough to run a container and paste a bot token into a secret file, but they are not necessarily developers, and they should never need to hand-write embed JSON. They come to the app with a specific message in mind: rules, an event notice, patch notes, a weekly digest, a server-wide maintenance warning. Often the same message has to go to several channels across several servers.

**Secondary: trusted co-operators.** A small allow-listed group (fellow admins or mods) who sign in to the same instance and share its bot, its templates and its history. They are not the public; nobody outside that list ever uses the app.

The operator usually works from a desktop browser while preparing a post, and sometimes from a phone to fix a typo or check whether a scheduled send went out.

## Product Purpose

embed-dash lets the operator write a Discord embed message, see exactly how it will appear in a Discord channel while writing it, and post it through their own bot to every channel that needs it in one action. Afterwards the operator can find any message they sent, edit it, and have the change reach every copy.

Success means three things. A message never looks different in Discord from what the preview showed. Nothing is rejected by Discord for breaking a limit the app could have caught. And the operator can find and correct last month's announcement in under a minute.

## Jobs

1. **Compose.** Write message text and up to ten embeds (author, title, description, fields, colour, image, thumbnail, footer, timestamp), attach links, images and files, and see every limit before Discord enforces it.
2. **Check.** Trust the live preview as a faithful rendering of Discord's dark chat view, including Discord markdown, mentions, inline field layout and media placement.
3. **Deliver.** Pick destination channels from every server the bot can reach, grouped by server and searchable by channel name, server name or ID; select many at once; send; and see a clear per-channel result, with a retry for each failure.
4. **Revisit.** Find an earlier message by text, channel, server or date, open it back in the composer, edit it, and update every copy it was sent to.
5. **Reuse and plan.** Save a message as a template, and schedule a send for a later time.

## Core Flows

- **First message.** Sign in, compose with the preview beside the form, open the channel picker, search, select channels, send, read the results, retry any failure.
- **Correction.** Open history, search for the message, edit it in the composer, confirm the list of copies that will change, apply, read per-copy results.
- **Recurring post.** Start from a template, change what is new this week, schedule it, and later confirm in history that it went out.

## Positioning

Existing embed tools are either hosted services that hold someone else's bot or webhook, or export-only editors that stop at JSON. embed-dash runs entirely on the operator's own machine, with the operator's own bot token, which never leaves the server. One instance reaches every server that bot is in, so a single send can cover many channels across many communities, and every copy stays linked for later edits.

## Operating Context

- Deployed with `docker compose` on a home server, NAS or small VPS, on one uncommon port (default 8742, configurable).
- The bot token is a Compose secret read on the server and never sent to the browser, logs or exports.
- Sign-in has three modes: none (local only, with a permanent visible warning), password, or Discord login that requests identity only and checks the user ID against an allowlist.
- Discord is the source of truth for servers, channels and permissions. The app reads them at runtime through the bot, and permission checks shown in the picker are advisory.
- Posting is irreversible from the audience's point of view: members see a message the moment it lands, and mentions can notify thousands of people. Mentions are suppressed by default.

## Capabilities and Constraints

- Discord's limits are enforced in the editor: content 2,000 characters; title 256; description 4,096; up to 25 fields with names of 256 and values of 1,024; footer 2,048; author 256; at most 10 embeds and 6,000 characters of embed text in total; file and request size limits.
- The preview renders Discord markdown safely, never as raw HTML.
- Milestones: (1) sign in, compose with live preview, pick channels, send; (2) history with editing, and templates; (3) scheduling and extras such as saved channel groups, JSON import and export, link buttons, and forum and announcement channels.
- **Open:** which community JSON format import and export must match, and which Discord client version and tolerance define an accurate preview. Both are recorded in `docs/research/product-and-discord.md`.

## Brand Commitments

- Name: **embed-dash**, always lower case.
- Mark: the white "ED" monogram on a rounded teal square (`assets/icon.svg`, teal `#0d9488`). Teal is the product's colour.
- The preview must look like a Discord message so the operator can trust it, but the app must not look like Discord or imply endorsement: no Discord logos, no Discord proprietary fonts, no copied trade dress outside the preview.
- Open source; bundled fonts and icons carry open licences with their notices.

## Voice

Plain, specific and calm. The app speaks like a careful colleague who has done this before: it names channels and servers, says exactly which limit was hit and by how much, and states what happened to each send. No exclamation marks, jokes or hype around sending. Warnings are direct about consequences ("This posts to 14 channels in 3 servers"). Errors give the cause and the next step.

## Product Principles

1. **What you see is what members get.** The preview is the product's promise. Any divergence from Discord is a bug, and anything the app cannot render faithfully is flagged instead of guessed.
2. **Catch it before Discord does.** Every limit and format rule is visible while typing, with the count and the fix, so a send never fails on validation.
3. **Many channels, one decision.** Choosing destinations across servers is fast, searchable and reviewable, and the final scope of a send is always stated before it happens.
4. **Every send is accounted for.** Each copy has its own result, its own retry and its own place in history. Partial failure is a normal, readable state, never a generic error.
5. **The operator's bot, the operator's machine.** Secrets stay on the server, and the product never asks for more access than the job needs.

## Anti-goals

- Not a general bot framework, moderation tool or analytics dashboard.
- Not a multi-tenant hosted service; one instance serves one bot and its trusted operators.
- Not a clone of Discord's interface or of an existing embed tool with a new name.
- No raw-JSON-first editing; JSON is an import and export format, not the main editor.
- No silent mass sends: a send never goes out without its destination list in view.

## Evidence on Hand

- `assets/icon.svg`: the monogram.
- `docs/research/`: comparables, Discord limits and markdown, stack and visual references.
- No real community content, screenshots or user quotes exist yet. Demonstration content in designs and tests is invented and must read as illustrative.

## Accessibility & Inclusion

WCAG 2.2 AA across the app chrome: visible labels, keyboard operation of the editor and the channel picker, visible focus, colour never the only signal for validation or send results, and reduced-motion support. The preview reproduces Discord's dark chat colours for accuracy; its text must still meet AA contrast.
