# Stack research

Snapshot: 27 November 2026. Versions, licences and last publication dates below are from the linked npm package pages (registry `latest` tag, not a compatibility guarantee). Pin exact versions in the lockfile and verify peer dependencies together before adopting them. The recommendation keeps a single Node process and SQLite database; it does not need a queue service.

## Server, storage and scheduling

- **HTTP:** [Fastify 5.12.8](https://www.npmjs.com/package/fastify) (MIT, 2026-11-02) offers a mature Node plugin ecosystem and schema-based request handling. [Hono 4.13.23](https://www.npmjs.com/package/hono) (MIT, 2026-11-26) is smaller and portable across runtimes, but that portability buys little in a Node-only container. [Express 5.3.0](https://www.npmjs.com/package/express) (MIT, 2026-10-09) is familiar and flexible but needs more assembly. Keep Fastify; use one validation source, rather than maintaining independent schemas.
- **Database:** [Drizzle 0.45.4](https://www.npmjs.com/package/drizzle-orm) (Apache-2.0, 2026-10-08) plus [better-sqlite3 13.2.0](https://www.npmjs.com/package/better-sqlite3) (MIT, 2026-11-14) gives typed SQL and explicit migrations with a mature synchronous driver. Keep transactions short to avoid blocking the event loop. [Node 26.13.1](https://nodejs.org/en/blog/release/v26.13.1) (2026-11-10; Node licence: MIT with dependencies under other licences) is the active LTS; its [node:sqlite remains stability 1.2, release candidate](https://nodejs.org/download/release/v26.13.1/docs/api/sqlite.html), not stable. Drizzle [supports both drivers](https://orm.drizzle.team/docs/sqlite/get-started-sqlite), so reassess when the built-in API is stable; its advantage is no native addon to ship. [Prisma](https://www.npmjs.com/package/prisma) (Apache-2.0; latest tag 8.0.0-rc.36, 2026-11-26) offers a schema and generated client, but adds generation and an adapter; its [SQLite setup](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/sqlite) can itself use better-sqlite3. Drizzle is the leaner fit.
- **Scheduled sends:** Store the payload, target, UTC due time and state in SQLite; on startup and on a short timer, claim due work transactionally, send outside the transaction, and record per-target outcomes. Recover abandoned claims on restart and define retry/backoff and cancellation explicitly. A crash after Discord accepts a send but before recording success creates an **unknown outcome**: automatic retry can duplicate a message; surface that state for reconciliation rather than promising exactly-once delivery. One process is assumed. [Croner 11.0.1](https://www.npmjs.com/package/croner) (MIT, 2026-11-14) provides cron/time-zone calculations but an in-memory timer alone is not durable. [Bree 9.2.9](https://www.npmjs.com/package/bree) (MIT, 2026-02-17) adds worker management but still requires persisted job state; [Agenda 6.2.8](https://www.npmjs.com/package/agenda) (MIT, 2026-11-13) adds persistent queue machinery and [backend dependencies](https://github.com/agenda/agenda). For one-off scheduled sends, a DB-polled loop is enough.

## Client and developer experience

- **Navigation/data:** [React Router 8.5.3](https://www.npmjs.com/package/react-router) (MIT, 2026-11-24) is sufficient for a small client-rendered SPA. [TanStack Router 1.170.46](https://www.npmjs.com/package/@tanstack/react-router) (MIT, 2026-10-22) offers stronger typed routes/search at the cost of more setup. [TanStack Query 5.108.4](https://www.npmjs.com/package/@tanstack/react-query) (MIT, 2026-11-23) handles server cache, invalidation and mutation states; editor drafts should remain local.
- **Forms:** A typed `useReducer` owns the nested embed draft and field-array operations, with derived preview and validation; add [Immer 11.2.13](https://www.npmjs.com/package/immer) (MIT, 2026-11-26) only if immutable updates become cumbersome. [Zustand 5.1.0](https://www.npmjs.com/package/zustand) (MIT, 2026-11-06) helps if draft state must span distant routes; [React Hook Form 7.92.0](https://www.npmjs.com/package/react-hook-form) (MIT, 2026-11-11) offers field registration and validation but introduces a second form-state model. Share [Zod 4.6.7](https://www.npmjs.com/package/zod) (MIT, 2026-10-12) schemas and types across client and server, validating again at the boundary. [Valibot 1.5.0](https://www.npmjs.com/package/valibot) (MIT, 2026-09-09) is modular and tree-shakeable; compare actual bundles if validation becomes significant.
- **Controls and styling:** [Radix primitives](https://www.radix-ui.com/primitives/docs/overview/accessibility) provide unstyled accessible interaction patterns; its [dialog 1.3.1](https://www.npmjs.com/package/@radix-ui/react-dialog) is MIT, published 2026-10-12. [React Aria Components 1.22.1](https://www.npmjs.com/package/react-aria-components) (Apache-2.0, 2026-10-09) has extensive accessible behavior and internationalization; [Base UI 1.9.0](https://www.npmjs.com/package/@base-ui/react) (MIT, 2026-10-09) is another unstyled accessible option. All require correct labeling and application-level keyboard testing; measure the actual imported components rather than assuming a universal bundle winner. Choose Radix selectively for dialogs, menus and popovers; use native controls where appropriate. CSS Modules plus custom properties give scoped styles and a small toolchain. [Tailwind 4.3.5](https://www.npmjs.com/package/tailwindcss) (MIT, 2026-11-06) is productive but imposes a utility vocabulary; [vanilla-extract 1.21.3](https://www.npmjs.com/package/@vanilla-extract/css) (MIT, 2026-10-08) provides typed, build-time styles with extra tooling.
- **Motion and large lists:** Use CSS transitions for local state changes and reduced-motion alternatives; [View Transitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) are progressive enhancement with a normal rendering fallback. [Motion 14.14.0](https://www.npmjs.com/package/motion) (MIT, 2026-11-13) is useful for complex gestures/layout choreography but is not needed initially. Filter channel names and server names first; add [TanStack Virtual 3.14.28](https://www.npmjs.com/package/@tanstack/react-virtual) (MIT, 2026-11-22) if measured list size warrants it, preserving keyboard focus and selection across virtual rows. For fuzzy matching, [match-sorter 8.3.2](https://www.npmjs.com/package/match-sorter) (MIT, 2026-11-25) is a simple ranked option; [Fuse.js 7.5.0](https://www.npmjs.com/package/fuse.js) (Apache-2.0, 2026-07-13) supports configurable fuzzy indexing; [uFuzzy 1.0.19](https://www.npmjs.com/package/@leeoniya/ufuzzy) (MIT, 2025-08-22) targets fast matching at greater API complexity. Start with case-insensitive substring search and add match-sorter only if needed.
- **Preview Markdown:** Evaluate [discord-markdown-parser 1.3.1](https://www.npmjs.com/package/discord-markdown-parser) (repository Apache-2.0, 2025-12-23; npm metadata says “Apache License”) first: it yields an AST and explicitly offers an [extended mode for embeds](https://github.com/ItzDerock/discord-markdown-parser). Render allowed nodes as React elements, never raw untrusted HTML; build fixtures against actual embed rendering, including escapes, links and unsupported syntax. [simple-markdown 0.7.3](https://www.npmjs.com/package/simple-markdown) (MIT, 2021-01-08) is an older generic parser needing Discord-specific rules. [@discord-message-components/core 0.2.1](https://www.npmjs.com/package/@discord-message-components/core) (2021-08-01; npm metadata has no licence) is old; its [project describes intentional visual differences](https://github.com/Danktuary/discord-message-components), so do not assume accuracy or reuse rights. A custom parser means ongoing grammar and security maintenance; use only if fixtures expose an unfixable gap. No library guarantees exact current Discord behavior.
- **Tooling:** [Vitest 5.1.2](https://www.npmjs.com/package/vitest) (MIT, 2026-11-25) for schema, parser and server integration tests; [Playwright 1.65.1](https://www.npmjs.com/package/@playwright/test) (Apache-2.0, 2026-11-13) for editor, keyboard, responsive and send flows. [ESLint 10.15.0](https://www.npmjs.com/package/eslint) and [typescript-eslint 8.74.0](https://www.npmjs.com/package/typescript-eslint) (both MIT; 2026-11-13 and 2026-11-23) support flat config; check their compatibility before pinning. [Prettier 3.10.1](https://www.npmjs.com/package/prettier) (MIT, 2026-11-12) complements ESLint's established plugin ecosystem. [Biome 2.6.9](https://www.npmjs.com/package/@biomejs/biome) (MIT OR Apache-2.0, 2026-11-24) combines fast formatting and linting, but check rule/plugin coverage before replacing both. Use a small [pnpm 12.23.0](https://www.npmjs.com/package/pnpm) (MIT, 2026-11-22) workspace with `web`, `server`, `shared`: explicit dependency boundaries and shared schemas justify the modest workspace setup; a single package is viable if the project stays tiny. [mise](https://mise.jdx.dev/) pins Node and pnpm for contributors; lock dependencies and pin the package-manager version too.

## Container

Use a multi-stage build: install with a frozen lockfile, compile web/server and native dependencies for the target architecture, then copy production dependencies and build outputs into a Node 26 Debian slim runtime. Run as a non-root user with a writable `/data` volume for the SQLite database, its WAL/SHM files and uploads. Build and runtime must match OS/libc, architecture and Node ABI; better-sqlite3 needs matching prebuilds or Python, make and a C++ compiler in the build stage. Alpine's musl can complicate prebuilds; slim is the safer baseline. Run migrations at startup, and expose a cheap local health endpoint. A healthcheck reports status but does not itself restart an unhealthy container. [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/), [Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/) and [healthcheck](https://docs.docker.com/reference/compose-file/services/#healthcheck).

Illustrative contract: the image must implement `/health`, read `DISCORD_TOKEN_FILE`, initialize `/data` with appropriate ownership for its non-root UID, and bundle a Node runtime. The token file is local and excluded from source control; Compose file secrets are mounted files, not a managed secret vault.

```yaml
services:
  embed-dash:
    image: embed-dash:latest
    ports:
      - "8742:8742"
    volumes:
      - embed-data:/data
    secrets:
      - discord_token
    environment:
      DISCORD_TOKEN_FILE: /run/secrets/discord_token
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8742/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
volumes:
  embed-data:
secrets:
  discord_token:
    file: ./discord-token.txt
```

## Recommended stack

Versions are observed releases, not proof of cross-package compatibility. Dates are last publication dates.

| Choice | Version / last release | Licence | Reason |
|---|---|---|---|
| [Node.js](https://nodejs.org/en/blog/release/v26.13.1) | 26.13.1 / 2026-11-10 | MIT and bundled dependency licences | Active LTS, single runtime |
| [React](https://www.npmjs.com/package/react), [TypeScript](https://www.npmjs.com/package/typescript), [Vite](https://www.npmjs.com/package/vite) | 19.3.1 / 2026-10-14; 7.0.2 / 2026-07-08; 8.4.0 / 2026-11-26 | MIT; Apache-2.0; MIT | Typed, responsive SPA |
| [Fastify](https://www.npmjs.com/package/fastify) | 5.12.8 / 2026-11-02 | MIT | Node HTTP and plugins |
| [Drizzle](https://www.npmjs.com/package/drizzle-orm) + [better-sqlite3](https://www.npmjs.com/package/better-sqlite3) | 0.45.4 / 2026-10-08; 13.2.0 / 2026-11-14 | Apache-2.0; MIT | Typed SQL, local persistence |
| SQLite polling | Application code | Project licence | Durable one-process schedules |
| [React Router](https://www.npmjs.com/package/react-router) + [TanStack Query](https://www.npmjs.com/package/@tanstack/react-query) | 8.5.3 / 2026-11-24; 5.108.4 / 2026-11-23 | MIT | Navigation and server state |
| React reducer + [Zod](https://www.npmjs.com/package/zod) | React 19.3.1; Zod 4.6.7 / 2026-10-12 | MIT | Local draft and shared validation |
| [Radix](https://www.npmjs.com/package/@radix-ui/react-dialog) + CSS Modules | Dialog 1.3.1 / 2026-10-12; CSS Modules via Vite | MIT | Accessible primitives, scoped styling |
| [discord-markdown-parser](https://www.npmjs.com/package/discord-markdown-parser) | 1.3.1 / 2025-12-23 | Apache-2.0 | Embed-oriented AST; verify fidelity |
| [Vitest](https://www.npmjs.com/package/vitest), [Playwright](https://www.npmjs.com/package/@playwright/test) | 5.1.2 / 2026-11-25; 1.65.1 / 2026-11-13 | MIT; Apache-2.0 | Unit/integration and browser coverage |
| [ESLint](https://www.npmjs.com/package/eslint), [typescript-eslint](https://www.npmjs.com/package/typescript-eslint), [Prettier](https://www.npmjs.com/package/prettier) | 10.15.0 / 2026-11-13; 8.74.0 / 2026-11-23; 3.10.1 / 2026-11-12 | MIT | Lint and consistent formatting |
| [pnpm](https://www.npmjs.com/package/pnpm) workspaces + [mise](https://mise.jdx.dev/) | pnpm 12.23.0 / 2026-11-22; pin mise at adoption | MIT; MIT | Small shared-code workspace and reproducible tools |
