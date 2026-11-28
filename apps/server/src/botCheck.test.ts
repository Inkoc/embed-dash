import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterAll, expect, test, vi } from "vitest";
import { startFakeDiscord } from "../../../e2e/fake-discord.js";
import { createApp } from "./app.js";

const fake = startFakeDiscord(0);
await once(fake, "listening");
afterAll(() => {
  fake.close();
});

/** A port that was free a moment ago, so a connection to it is refused. */
async function closedPort() {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as { port: number };
  server.close();
  await once(server, "close");
  return port;
}

/** Starts the app for real and returns the one line the token check logs. */
async function startupLine(botToken: string, apiPort: number) {
  const dir = mkdtempSync(join(tmpdir(), "embed-bot-check-"));
  let logs = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      logs += String(chunk);
      callback();
    },
  });
  const app = await createApp(
    {
      maxUploadMb: 10,
      uploadRetentionDays: 14,
      authMode: "none",
      botToken,
      host: "127.0.0.1",
      port: 0,
      dataDir: dir,
      discordApiBase: `http://127.0.0.1:${apiPort}/api`,
    },
    { logger: { stream } },
  );
  try {
    await app.listen({ port: 0, host: "127.0.0.1" });
    // Startup doesn't wait for Discord: the server answers before the check is logged.
    expect((await app.inject("/health")).statusCode).toBe(200);
    const lines = () =>
      logs
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((line) => String(line.msg).startsWith("Discord:"));
    await vi.waitFor(() => expect(lines()).toHaveLength(1), {
      timeout: 10_000,
    });
    expect(logs).not.toContain(botToken);
    return lines()[0]!;
  } finally {
    await app.close();
    rmSync(dir, { recursive: true });
  }
}

const port = () => (fake.address() as { port: number }).port;

test("logs the bot's name when Discord accepts the token", async () => {
  expect(await startupLine("e2e-test-token", port())).toMatchObject({
    level: 30,
    msg: "Discord: connected as Walking Skeleton Bot",
  });
});

test("a refused token says where the right one is", async () => {
  const line = await startupLine("startup-refused-fixture-token", port());
  expect(line).toMatchObject({
    level: 40,
    code: "DISCORD_INVALID_TOKEN",
    status: 401,
  });
  expect(line.msg).toContain("the bot token was refused");
  expect(line.msg).toContain("not the client secret or application ID");
});

test("an unreachable Discord points at the network", async () => {
  const line = await startupLine(
    "startup-unreachable-fixture-token",
    await closedPort(),
  );
  expect(line).toMatchObject({
    level: 40,
    code: "DISCORD_UNREACHABLE",
    causeCode: "ECONNREFUSED",
  });
  expect(line.msg).toContain("network connection and DNS");
}, 20_000);
