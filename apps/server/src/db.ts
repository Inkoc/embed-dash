import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { StartupError } from "./errors.js";
export function openDatabase(dataDir: string) {
  let sqlite: Database.Database;
  try {
    mkdirSync(dataDir, { recursive: true });
    sqlite = new Database(join(dataDir, "embed-dash.db"));
  } catch (error) {
    throw new StartupError("database", error);
  }
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite);
    migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../drizzle/", import.meta.url)),
    });
    return sqlite;
  } catch (error) {
    sqlite.close();
    throw new StartupError("migration", error);
  }
}
