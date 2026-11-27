import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { createApp } from "../apps/server/src/app.js";
import { startFakeDiscord } from "./fake-discord.js";
// E2E_PORT lets two checkouts run the suite side by side; the fake Discord takes the next port.
const port = Number(process.env.E2E_PORT ?? 18742);
const dataDir = mkdtempSync(join(tmpdir(), "embed-e2e-"));
const fake = startFakeDiscord(port + 1);
await once(fake, "listening");
const app = await createApp(
  {
    botToken: "e2e-test-token",
    host: "127.0.0.1",
    port,
    dataDir,
    discordApiBase: `http://127.0.0.1:${port + 1}/api`,
  },
  { spaRoot: resolve("apps/web/dist"), logger: false },
);
await app.listen({ port, host: "127.0.0.1" });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => {
      fake.close();
      rmSync(dataDir, { recursive: true });
    });
  });
