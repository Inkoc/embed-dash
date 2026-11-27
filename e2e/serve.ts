import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { createApp } from "../apps/server/src/app.js";
import { startFakeDiscord } from "./fake-discord.js";
const dataDir = mkdtempSync(join(tmpdir(), "embed-e2e-"));
const fake = startFakeDiscord(18743);
await once(fake, "listening");
const app = await createApp(
  {
    botToken: "e2e-test-token",
    host: "127.0.0.1",
    port: 18742,
    dataDir,
    discordApiBase: "http://127.0.0.1:18743/api",
  },
  { spaRoot: resolve("apps/web/dist"), logger: false },
);
await app.listen({ port: 18742, host: "127.0.0.1" });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => {
      fake.close();
      rmSync(dataDir, { recursive: true });
    });
  });
