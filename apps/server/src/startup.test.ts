import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { expect, test } from "vitest";

const run = promisify(execFile);
const token = "startup-private-fixture-token";
// Each case spawns tsx, which can take several seconds on a cold, slow runner.
const spawnTimeout = 20_000;
const testTimeout = 2 * spawnTimeout + 5_000;
async function failure(dataDir: string, port = 8742) {
  try {
    await run(
      process.execPath,
      ["--import", "tsx", resolve("apps/server/src/index.ts")],
      {
        env: {
          PATH: process.env.PATH,
          BOT_TOKEN: token,
          AUTH_MODE: "none",
          DATA_DIR: dataDir,
          PORT: String(port),
        },
        timeout: spawnTimeout,
      },
    );
    throw new Error("Expected startup failure");
  } catch (error) {
    const result = error as { code: number; stderr: string };
    expect(result.code).toBe(1);
    expect(result.stderr).not.toContain(token);
    return JSON.parse(result.stderr.trim());
  }
}

test("startup diagnoses a busy port and closes the database", async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  const dir = mkdtempSync(join(tmpdir(), "embed-startup-"));
  try {
    expect(await failure(dir, address.port)).toMatchObject({
      stage: "listen",
      causeCode: "EADDRINUSE",
    });
    // A cleanly closed WAL database is checkpointed, its side files are
    // removed and nothing holds a lock, so an exclusive writer gets in at once.
    const file = join(dir, "embed-dash.db");
    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}-wal`)).toBe(false);
    expect(existsSync(`${file}-shm`)).toBe(false);
    const sqlite = new Database(file, { timeout: 0 });
    try {
      sqlite.pragma("locking_mode = EXCLUSIVE");
      expect(() => sqlite.exec("BEGIN EXCLUSIVE; COMMIT;")).not.toThrow();
    } finally {
      sqlite.close();
    }
  } finally {
    server.close();
    rmSync(dir, { recursive: true });
  }
}, testTimeout);

test("startup distinguishes inaccessible storage from failed migration", async () => {
  const dir = mkdtempSync(join(tmpdir(), "embed-storage-"));
  try {
    const file = join(dir, "not-a-directory");
    writeFileSync(file, token);
    expect(await failure(file)).toMatchObject({
      stage: "database",
      causeCode: "EEXIST",
    });
    writeFileSync(join(dir, "embed-dash.db"), token);
    expect(await failure(dir)).toMatchObject({
      stage: "migration",
      causeCode: "SQLITE_NOTADB",
    });
  } finally {
    rmSync(dir, { recursive: true });
  }
}, testTimeout);
