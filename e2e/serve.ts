import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { createApp } from "../apps/server/src/app.js";
import { startFakeDiscord } from "./fake-discord.js";
const dataDir = mkdtempSync(join(tmpdir(), "embed-e2e-"));
const port = Number(process.env.E2E_PORT ?? 28742);
const fake = startFakeDiscord(0);
await once(fake, "listening");
const address = fake.address();
if (!address || typeof address === "string")
  throw new Error("No fake API address");
const app = await createApp(
  {
    botToken: "e2e-test-token",
    authMode: process.env.E2E_AUTH_MODE === "none" ? "none" : "password",
    adminPassword: "e2e-password",
    host: "127.0.0.1",
    port,
    dataDir,
    discordApiBase: `http://127.0.0.1:${address.port}/api`,
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
