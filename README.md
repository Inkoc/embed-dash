<img src="assets/icon.svg" width="64" height="64" alt="">

# embed-dash

A self-hosted web app for building Discord embeds with a pixel-accurate live preview and sending them through your own bot. Pick channels across every server the bot is in, send to many at once, and keep a searchable history so sent messages can be edited later. Runs as a single Docker container with `docker compose`.

## Setup

Install Docker with Compose. Create `secrets/bot_token.txt` containing your Discord bot token (one line); this file stays outside version control. Compose file secrets retain host permissions: make it readable by container uid 1000 with `chmod 644 secrets/bot_token.txt`, or assign ownership to uid 1000 and keep restrictive permissions. Then run:

```sh
mkdir -p secrets
# Create secrets/bot_token.txt with your editor before starting.
docker compose up --build
```

Open <http://127.0.0.1:8742>. The composer opens with an illustrative example embed and a live Discord-style preview; the top bar shows which bot is connected. Sending to channels is not available yet. The service binds to localhost and has no authentication in this baseline. SQLite lives in the named `embed-data` volume and migrations run at startup. Stop with `docker compose down`; the volume persists.

### Development

Install [mise](https://mise.jdx.dev/) and a C++ build toolchain (Python 3, make and a C++ compiler) if a SQLite prebuild is unavailable. On Ubuntu: `sudo apt-get install python3 make g++`.

```sh
mise install && pnpm install
BOT_TOKEN_FILE=./secrets/bot_token.txt DATA_DIR=./data pnpm dev
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

The visual design system is described in [DESIGN.md](DESIGN.md), and bundled fonts and icons with their licences in [docs/assets.md](docs/assets.md). To serve a production build outside Docker, run `NODE_ENV=production BOT_TOKEN_FILE=./secrets/bot_token.txt DATA_DIR=./data node apps/server/dist/index.js` after `pnpm build`.

Dependencies are locked. TypeScript 6.0.3 is retained for typescript-eslint's supported range; the other adopted packages use compatible current releases. The project is licensed under [AGPL-3.0](LICENSE).

Generate SQLite migrations with `pnpm --filter @embed-dash/server db:generate` after editing `apps/server/src/schema.ts`. The generated initial migration includes a snapshot; its journal timestamp retains the original baseline value so existing databases do not apply the equivalent initial table twice.
