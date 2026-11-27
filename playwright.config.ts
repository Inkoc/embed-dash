import { join } from "node:path";
import { defineConfig } from "@playwright/test";
const port = Number(process.env.E2E_PORT ?? 28742);
export default defineConfig({
  globalSetup: "./e2e/setup.ts",
  testDir: "./e2e",
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? "test-results",
  reporter: [["list"]],
  use: {
    // Kept beside other ignored test output so runs leave nothing outside the repo.
    storageState: join("test-results", `e2e-auth-${port}.json`),
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
  },
  webServer: {
    command: "pnpm build && pnpm exec tsx e2e/serve.ts",
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
  },
});
