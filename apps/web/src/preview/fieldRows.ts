import type { EmbedField } from "../compose/draft";

export interface PlacedField {
  field: EmbedField;
  /** Grid columns out of 12, as Discord lays fields on a 12-column row. */
  start: number;
  end: number;
}

/**
 * Discord places up to three inline fields side by side, or two when a
 * thumbnail takes the right edge; a full-width field always starts a new row.
 * Fields without a name or value are skipped, as Discord would reject them.
 */
export function fieldRows(
  fields: readonly EmbedField[],
  hasThumbnail: boolean,
): PlacedField[][] {
  const perRow = hasThumbnail ? 2 : 3;
  const rows: PlacedField[][] = [];
  let run: EmbedField[] = [];
  const flush = () => {
    for (let i = 0; i < run.length; i += perRow) {
      const row = run.slice(i, i + perRow);
      const span = 12 / row.length;
      rows.push(
        row.map((field, j) => ({
          field,
          start: 1 + j * span,
          end: 1 + (j + 1) * span,
        })),
      );
    }
    run = [];
  };
  for (const field of fields) {
    if (!field.name.trim() || !field.value.trim()) continue;
    if (field.inline) run.push(field);
    else {
      flush();
      rows.push([{ field, start: 1, end: 13 }]);
    }
  }
  flush();
  return rows;
}
