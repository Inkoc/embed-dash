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
  ...["0", "26", "1.5", "abc", ""].map((MAX_UPLOAD_MB) => [
    { BOT_TOKEN: "test", MAX_UPLOAD_MB },
    "MAX_UPLOAD_MB",
  ]),
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

test.each([
  "-1",
  "true",
  "1.5",
  "11",
  "",
  "abc",
  "10.0.0.0/33",
  "::/129",
  "10.0.0.0/",
  "10.0.0.0/8/8",
  "10.0.0.0/-1",
  "10.0.0.0/1.5",
  "/8",
  "0.0.0.0/0",
  "::/0",
  "10.0.0.0/0",
])("rejects invalid proxy trust %s", (TRUST_PROXY) => {
  expect(() =>
    readConfig({ BOT_TOKEN: "fixture", AUTH_MODE: "none", TRUST_PROXY }),
  ).toThrow("TRUST_PROXY");
});
test("proxy trust is opt-in and public origins are validated", () => {
  const base = { BOT_TOKEN: "fixture", AUTH_MODE: "none" };
  expect(readConfig(base).trustProxy).toBeUndefined();
  expect(
    readConfig({
      ...base,
      TRUST_PROXY: "127.0.0.1, ::1,172.18.0.0/16,fd00::/8,10.0.0.5/32",
      PUBLIC_URL: "https://embed.example/",
    }),
  ).toMatchObject({
    trustProxy: [
      "127.0.0.1",
      "::1",
      "172.18.0.0/16",
      "fd00::/8",
      "10.0.0.5/32",
    ],
    publicUrl: "https://embed.example",
  });
  for (const PUBLIC_URL of [
    "file:///tmp",
    "https://user:secret@example.com",
    "https://example.com/path",
    "invalid",
  ])
    expect(() => readConfig({ ...base, PUBLIC_URL })).toThrow("PUBLIC_URL");
});

const discordEnv = {
  BOT_TOKEN: "fixture",
  AUTH_MODE: "discord",
  DISCORD_CLIENT_ID: "999999999999999999",
  DISCORD_CLIENT_SECRET: "fixture-secret",
  PUBLIC_URL: "https://embed.example/",
  ALLOWED_USER_IDS: "111111111111111111, 222222222222222222,111111111111111111",
};
test("reads Discord login settings, with the secret file taking precedence", () => {
  expect(readConfig(discordEnv)).toMatchObject({
    authMode: "discord",
    publicUrl: "https://embed.example",
    discordLogin: {
      clientId: "999999999999999999",
      clientSecret: "fixture-secret",
      allowedUserIds: ["111111111111111111", "222222222222222222"],
    },
  });
  const dir = mkdtempSync(join(tmpdir(), "embed-discord-config-"));
  try {
    writeFileSync(join(dir, "secret"), "file-secret\n");
    expect(
      readConfig({
        ...discordEnv,
        INIT_CWD: dir,
        DISCORD_CLIENT_SECRET_FILE: "secret",
      }).discordLogin,
    ).toMatchObject({ clientSecret: "file-secret" });
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test("Discord settings are ignored in other modes, and an empty PUBLIC_URL is unset", () => {
  const config = readConfig({
    BOT_TOKEN: "fixture",
    AUTH_MODE: "none",
    DISCORD_CLIENT_ID: "invalid",
    PUBLIC_URL: "",
  });
  expect(config.discordLogin).toBeUndefined();
  expect(config.publicUrl).toBeUndefined();
});
test.each([
  [{ DISCORD_CLIENT_ID: undefined }, "DISCORD_CLIENT_ID"],
  [{ DISCORD_CLIENT_ID: "my-app" }, "DISCORD_CLIENT_ID"],
  [{ DISCORD_CLIENT_SECRET: undefined }, "DISCORD_CLIENT_SECRET"],
  [{ DISCORD_CLIENT_SECRET: "two words" }, "DISCORD_CLIENT_SECRET"],
  [
    { DISCORD_CLIENT_SECRET_FILE: "/nonexistent-secret" },
    "DISCORD_CLIENT_SECRET_FILE",
  ],
  [{ PUBLIC_URL: undefined }, "PUBLIC_URL"],
  [{ PUBLIC_URL: "https://embed.example/app" }, "PUBLIC_URL"],
  [{ ALLOWED_USER_IDS: undefined }, "ALLOWED_USER_IDS"],
  [{ ALLOWED_USER_IDS: " , " }, "ALLOWED_USER_IDS"],
  [{ ALLOWED_USER_IDS: "111111111111111111,someone" }, "ALLOWED_USER_IDS"],
  [{ ALLOWED_USER_IDS: "@someone" }, "ALLOWED_USER_IDS"],
] as [Record<string, string | undefined>, string][])(
  "fails startup for invalid Discord login settings %j",
  (override, field) => {
    expect(() => readConfig({ ...discordEnv, ...override })).toThrow(field);
  },
);
test("Discord config errors never include the secret", () => {
  try {
    readConfig({ ...discordEnv, ALLOWED_USER_IDS: "nope" });
  } catch (error) {
    expect(String(error)).not.toContain("fixture-secret");
  }
});
test("files only a draft uses are kept 14 days by default, or as set", () => {
  const env = { ADMIN_PASSWORD: "fixture-password", BOT_TOKEN: "test" };
  expect(readConfig(env).uploadRetentionDays).toBe(14);
  expect(
    readConfig({ ...env, UPLOAD_RETENTION_DAYS: "30" }).uploadRetentionDays,
  ).toBe(30);
  // Compose passes an unset variable through as an empty string.
  expect(
    readConfig({ ...env, UPLOAD_RETENTION_DAYS: "" }).uploadRetentionDays,
  ).toBe(14);
  for (const UPLOAD_RETENTION_DAYS of ["0", "-1", "1.5", "abc", "1e3"])
    expect(() => readConfig({ ...env, UPLOAD_RETENTION_DAYS })).toThrow(
      "UPLOAD_RETENTION_DAYS",
    );
});
test("the per-file upload limit defaults to 10 MB and can be set", () => {
  const env = { ADMIN_PASSWORD: "fixture-password", BOT_TOKEN: "test" };
  expect(readConfig(env).maxUploadMb).toBe(10);
  expect(readConfig({ ...env, MAX_UPLOAD_MB: "3" }).maxUploadMb).toBe(3);
});
