import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
async function main() {
  const config = (() => {
    try {
      return readConfig();
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "Invalid configuration",
      );
      process.exit(1);
    }
  })();
  const app = await createApp(config, {
    spaRoot:
      process.env.NODE_ENV === "production"
        ? fileURLToPath(new URL("../../web/dist/", import.meta.url))
        : undefined,
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void app.close();
    });
  await app.listen({ port: config.port, host: "0.0.0.0" });
}
main().catch(() => {
  console.error(
    "Startup failed. Check configuration, secret file, data directory and port.",
  );
  process.exitCode = 1;
});
