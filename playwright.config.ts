import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? "test-results",
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:18742", browserName: "chromium" },
  webServer: {
    command: "pnpm build && pnpm exec tsx e2e/serve.ts",
    url: "http://127.0.0.1:18742/health",
    reuseExistingServer: false,
  },
});
