import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { createApp } from "../apps/server/src/app.js";
import { fakeGuilds, fakeOAuth, startFakeDiscord } from "./fake-discord.js";
const dataDir = mkdtempSync(join(tmpdir(), "embed-e2e-"));
const discordDataDir = mkdtempSync(join(tmpdir(), "embed-e2e-discord-"));
const port = Number(process.env.E2E_PORT ?? 28742);
const fake = startFakeDiscord(0);
await once(fake, "listening");
// #results in Lanternfall Cup EU refuses its first post, so specs can see a failure and then retry it.
fake.fail(fakeGuilds[2].channels[2].id, { status: 403, code: 50013 });
const address = fake.address();
if (!address || typeof address === "string")
  throw new Error("No fake API address");
const discordApiBase = `http://127.0.0.1:${address.port}/api`;
const spaRoot = resolve("apps/web/dist");
// A second instance in Discord login mode, one port above, for the sign-in specs.
// It listens first so the main instance's health check covers both.
const discordPort = port + 1;
const discordApp = await createApp(
  {
    botToken: "e2e-test-token",
    authMode: "discord",
    host: "127.0.0.1",
    port: discordPort,
    dataDir: discordDataDir,
    discordApiBase,
    publicUrl: `http://127.0.0.1:${discordPort}`,
    discordLogin: {
      clientId: fakeOAuth.clientId,
      clientSecret: fakeOAuth.secret,
      allowedUserIds: ["111111111111111111"],
    },
  },
  { spaRoot, logger: false },
);
await discordApp.listen({ port: discordPort, host: "127.0.0.1" });
const app = await createApp(
  {
    botToken: "e2e-test-token",
    authMode: process.env.E2E_AUTH_MODE === "none" ? "none" : "password",
    adminPassword: "e2e-password",
    host: "127.0.0.1",
    port,
    dataDir,
    discordApiBase,
  },
  { spaRoot, logger: false },
);
await app.listen({ port, host: "127.0.0.1" });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void Promise.all([app.close(), discordApp.close()]).then(() => {
      fake.close();
      rmSync(dataDir, { recursive: true });
      rmSync(discordDataDir, { recursive: true });
    });
  });
