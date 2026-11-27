import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.{ts,tsx}", "packages/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.ts"],
      exclude: ["**/*.test.*", "**/vite-env.d.ts"],
      reportsDirectory:
        process.env.COVERAGE_DIR ??
        join(homedir(), "forge-artifacts/embed-dash/scaffold/coverage"),
      reporter: [["text", { skipFull: false }], "json-summary", "html"],
    },
  },
});
