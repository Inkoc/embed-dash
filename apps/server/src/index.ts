import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { StartupError, startupFailure } from "./errors.js";
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
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (error) {
    await app.close();
    throw new StartupError("listen", error);
  }
}
main().catch((error: unknown) => {
  console.error(JSON.stringify(startupFailure(error)));
  process.exitCode = 1;
});
