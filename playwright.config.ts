import { defineConfig } from "@playwright/test";
import { homedir } from "node:os";
import { join } from "node:path";
const artifacts = join(homedir(), "forge-artifacts/embed-dash/scaffold");
export default defineConfig({
  testDir: "./e2e",
  outputDir: join(artifacts, "test-results"),
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:18742", browserName: "chromium" },
  webServer: {
    command: "pnpm build && pnpm exec tsx e2e/serve.ts",
    url: "http://127.0.0.1:18742/health",
    reuseExistingServer: false,
  },
});
