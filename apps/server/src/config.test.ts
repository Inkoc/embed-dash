import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readConfig } from "./config.js";
test("reads defaults and secret files with file precedence", () => {
  const dir = mkdtempSync(join(tmpdir(), "embed-config-"));
  try {
    const file = join(dir, "token");
    writeFileSync(file, "file-token\n");
    expect(
      readConfig({
        ADMIN_PASSWORD: "fixture-password",
        BOT_TOKEN: "env-token",
        BOT_TOKEN_FILE: file,
      }),
    ).toMatchObject({
      botToken: "file-token",
      port: 8742,
      dataDir: "/data",
      discordApiBase: "https://discord.com/api",
    });
    expect(
      readConfig({
        ADMIN_PASSWORD: "fixture-password",
        BOT_TOKEN: "env-token",
        PORT: "9000",
        DATA_DIR: dir,
        DISCORD_API_BASE: "http://localhost:9001/",
      }),
    ).toMatchObject({
      botToken: "env-token",
      port: 9000,
      dataDir: dir,
      discordApiBase: "http://localhost:9001",
    });
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test.each([
  [{}, "BOT_TOKEN"],
  [{ BOT_TOKEN: " " }, "BOT_TOKEN"],
  [{ BOT_TOKEN: "two words" }, "BOT_TOKEN"],
  [{ BOT_TOKEN_FILE: "/nonexistent-secret-file" }, "BOT_TOKEN_FILE"],
  ...["0", "65536", "3.2", "abc", ""].map((PORT) => [
    { BOT_TOKEN: "test", PORT },
    "PORT",
  ]),
  [{ BOT_TOKEN: "test", DATA_DIR: "" }, "DATA_DIR"],
  [{ BOT_TOKEN: "test", HOST: "invalid" }, "HOST"],
  ...[
    "invalid",
    "file:///tmp/api",
    "https://user:password@example.com",
    "https://example.com?secret=x",
  ].map((DISCORD_API_BASE) => [
    { BOT_TOKEN: "test", DISCORD_API_BASE },
    "DISCORD_API_BASE",
  ]),
] as [NodeJS.ProcessEnv, string][])(
  "rejects invalid config without exposing values",
  (env, field) => {
    expect(() => readConfig(env)).toThrow(field);
  },
);

test("resolves workspace-relative paths from the invoking directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "embed-workspace-"));
  try {
    writeFileSync(join(dir, "token"), "fixture-token");
    expect(
      readConfig({
        ADMIN_PASSWORD: "fixture-password",
        INIT_CWD: dir,
        BOT_TOKEN_FILE: "token",
        DATA_DIR: "data",
      }),
    ).toMatchObject({
      botToken: "fixture-token",
      dataDir: join(dir, "data"),
      host: "127.0.0.1",
    });
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("auth mode defaults to password, rejects unsupported modes and reads password files", () => {
  const base = { BOT_TOKEN: "fixture" };
  expect(() => readConfig(base)).toThrow("ADMIN_PASSWORD");
  expect(() => readConfig({ ...base, AUTH_MODE: "discord" })).toThrow(
    "not supported yet",
  );
  expect(() => readConfig({ ...base, AUTH_MODE: "other" })).toThrow(
    "AUTH_MODE",
  );
  expect(readConfig({ ...base, AUTH_MODE: "none" }).authMode).toBe("none");
  expect(readConfig({ ...base, ADMIN_PASSWORD: "fixture" }).authMode).toBe(
    "password",
  );
  const dir = mkdtempSync(join(tmpdir(), "embed-password-"));
  try {
    writeFileSync(join(dir, "password"), "file-password\n");
    expect(
      readConfig({
        ...base,
        INIT_CWD: dir,
        ADMIN_PASSWORD_FILE: "password",
        ADMIN_PASSWORD: "env",
      }).adminPassword,
    ).toBe("file-password");
    expect(() =>
      readConfig({ ...base, ADMIN_PASSWORD_FILE: join(dir, "missing") }),
    ).toThrow("ADMIN_PASSWORD_FILE");
  } finally {
    rmSync(dir, { recursive: true });
  }
});
