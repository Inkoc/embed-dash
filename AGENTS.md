# AGENTS.md — embed-dash

Self-hosted Discord embed composer and sender. Read `docs/spec.md`, `docs/architecture.md`, `PRODUCT.md` and (once it exists) `DESIGN.md` before changing anything.

## Stack

pnpm workspace on Node 26 (versions pinned in `mise.toml`): `apps/web` (React + TypeScript, Vite, React Router, TanStack Query, CSS Modules), `apps/server` (Fastify, Drizzle + better-sqlite3, `@discordjs/rest`), `packages/shared` (Zod schemas and Discord limits), `e2e/` (Playwright with a fake Discord API).

## Commands

| Task | Command |
|---|---|
| Setup | `mise install && pnpm install` |
| Dev (web + server, hot reload) | `pnpm dev` |
| Unit / integration tests | `pnpm test` |
| Coverage (all of `src` in every package) | `pnpm test:coverage` |
| Lint | `pnpm lint` |
| Format check / fix | `pnpm format:check` / `pnpm format` |
| Typecheck | `pnpm typecheck` |
| E2E | `pnpm e2e` (first time: `pnpm exec playwright install chromium`) |
| Build | `pnpm build` |
| Everything CI runs | `bash scripts/ci.sh` |
| Container | `docker compose up --build` |

## Conventions

- TypeScript strict everywhere. Shared types and validation come from `packages/shared`; never duplicate a Discord limit.
- Discord limits and rules live in one place (`packages/shared`) and are unit-tested.
- The bot token never leaves the server: not in responses, logs, errors or the client bundle.
- Preview markdown is rendered to React elements; never `dangerouslySetInnerHTML`.
- UI follows `DESIGN.md`: tokens only (no raw hex, px font sizes or one-off spacing), signature elements and motion preserved, loading / empty / error states for every data view, visible labels, 44 px tap targets, `prefers-reduced-motion` respected.
- Tests: unit tests for logic and key components; Playwright for critical flows on desktop, plus 360 px only for layout-critical specs. E2E never calls the real Discord API.
- Conventional Commits. Code comments explain why. No issue or PR numbers in code comments.
- No speculative code: build only what the current ticket's acceptance criteria need.

## Team rules

- Never push to `main`; every change goes through a branch and a PR. Never edit `.github/workflows/`; CI runs `scripts/ci.sh`, so change that instead.
- Screenshots, recordings, concept prototypes and reports go to `~/forge-artifacts/embed-dash/`, never into git.
- Media budget: bundled media (fonts, icons, images) stays under 50 MB in total and each file has a rights record (source, licence, date checked) in `docs/assets.md`. No Discord logos or proprietary fonts.
- Core content must not depend on a third-party host at runtime, other than the Discord API and the media URLs users enter themselves.
- No AI attribution in commits or PRs.
- Keep this file true: if a command changes, update it in the same PR.
