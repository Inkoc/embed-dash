import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { openDatabase } from "./db.js";

const journal = JSON.parse(
  readFileSync(
    new URL("../drizzle/meta/_journal.json", import.meta.url),
    "utf8",
  ),
) as { entries: { tag: string; when: number }[] };
const historyMigration = journal.entries.find(
  (entry) => entry.tag === "0008_eminent_klaw",
)!;

test("the history migration folds existing Unicode text and indexes creation time", () => {
  const dir = mkdtempSync(join(tmpdir(), "history-migration-"));
  let db = openDatabase(dir);
  try {
    db.prepare(
      "INSERT INTO sends (id, payload_json, search_text, status, created_at, updated_at) VALUES ('old', '{}', 'ÉTÉ Αθήνα', 'done', 1, 1)",
    ).run();
    // Replay the generated migration, and the ones after it, against a
    // database at the preceding version.
    db.exec("DROP INDEX sends_created_at_idx");
    db.exec("DROP TABLE channel_groups");
    db.prepare("DELETE FROM __drizzle_migrations WHERE created_at >= ?").run(
      historyMigration.when,
    );
    db.close();
    db = openDatabase(dir);
    expect(db.prepare("SELECT search_text FROM sends").get()).toEqual({
      search_text: "été αθήνα",
    });
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'sends_created_at_idx'",
        )
        .get(),
    ).toBeTruthy();
  } finally {
    db.close();
    rmSync(dir, { recursive: true });
  }
});
