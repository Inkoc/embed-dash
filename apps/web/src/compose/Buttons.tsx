import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { discordLimits, type LinkButtonDraft } from "@embed-dash/shared";
import { newId, useDraft, type ButtonRow } from "./draft";
import { useEditorState } from "./editorState";
import { TextControl } from "./TextControl";
import styles from "./Buttons.module.css";

const blankButton = () => ({
  type: 2 as const,
  style: 5 as const,
  label: "",
  url: "",
  key: newId(),
});
const move = <T,>(items: T[], index: number, by: number) => {
  const next = [...items];
  next.splice(index + by, 0, next.splice(index, 1)[0]!);
  return next;
};

export function Buttons() {
  const { draft, setDraft } = useDraft();
  const { focusAfter } = useEditorState();
  const [moved, setMoved] = useState<string | null>(null);
  const [announcement, announce] = useState("");
  const rows = draft.components ?? [];
  const update = (change: (rows: ButtonRow[]) => ButtonRow[]) =>
    setDraft((current) => ({
      ...current,
      components: change(current.components ?? []),
    }));
  const changeButton = (
    rowKey: string,
    key: string,
    change: Partial<LinkButtonDraft>,
  ) =>
    update((rows) =>
      rows.map((row) =>
        row.key === rowKey
          ? {
              ...row,
              components: row.components.map((button) =>
                button.key === key ? { ...button, ...change } : button,
              ),
            }
          : row,
      ),
    );
  const reorder = (row: ButtonRow, r: number, b: number | null, by: number) => {
    const itemKey = b === null ? row.key : row.components[b]!.key;
    const to = (b ?? r) + by;
    const count = b === null ? rows.length : row.components.length;
    const direction =
      to === 0 ? "down" : to === count - 1 ? "up" : by < 0 ? "up" : "down";
    focusAfter(`${itemKey}-${direction}`, () => {
      setMoved(itemKey);
      update((rows) =>
        b === null
          ? move(rows, r, by)
          : rows.map((item) =>
              item.key === row.key
                ? { ...item, components: move(item.components, b, by) }
                : item,
            ),
      );
    });
    announce(
      b === null
        ? `Row moved to position ${r + by + 1}.`
        : `Button moved to position ${b + by + 1}.`,
    );
  };
  return (
    <section className={styles.section} aria-labelledby="s-buttons">
      <div className={styles.head}>
        <h3 id="s-buttons">Buttons</h3>
        <span>
          {rows.length} of {discordLimits.buttonRows} rows
        </span>
      </div>
      <p className={styles.hint}>
        {rows.length
          ? "Link buttons appear below the embeds. Add a label or emoji and a web link."
          : "Add links readers can open from your message."}
      </p>
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
      {rows.map((row, r) => (
        <div
          className={styles.row}
          key={row.key}
          data-moved={moved === row.key || undefined}
          onAnimationEnd={() => setMoved(null)}
        >
          <div className={styles.head}>
            <h4 id={`${row.key}-head`} tabIndex={-1}>
              Row {r + 1}
            </h4>
            <div className={styles.actions}>
              <button
                type="button"
                id={`${row.key}-up`}
                disabled={r === 0}
                aria-label={`Move row ${r + 1} up`}
                onClick={() => reorder(row, r, null, -1)}
              >
                <ArrowUp aria-hidden="true" />
              </button>
              <button
                type="button"
                id={`${row.key}-down`}
                disabled={r === rows.length - 1}
                aria-label={`Move row ${r + 1} down`}
                onClick={() => reorder(row, r, null, 1)}
              >
                <ArrowDown aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Remove row ${r + 1}`}
                onClick={() =>
                  focusAfter("buttons-add-row", () =>
                    update((rows) =>
                      rows.filter((item) => item.key !== row.key),
                    ),
                  )
                }
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          </div>
          {row.components.map((button, b) => (
            <div
              className={styles.button}
              key={button.key}
              data-moved={moved === button.key || undefined}
              onAnimationEnd={(event) => {
                event.stopPropagation();
                setMoved(null);
              }}
              role="group"
              aria-label={`Row ${r + 1}, button ${b + 1}`}
            >
              <div className={styles.head}>
                <h5>Button {b + 1}</h5>
                <div className={styles.actions}>
                  <button
                    type="button"
                    id={`${button.key}-up`}
                    disabled={b === 0}
                    aria-label={`Move button ${b + 1} up in row ${r + 1}`}
                    onClick={() => reorder(row, r, b, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    id={`${button.key}-down`}
                    disabled={b === row.components.length - 1}
                    aria-label={`Move button ${b + 1} down in row ${r + 1}`}
                    onClick={() => reorder(row, r, b, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove button ${b + 1} from row ${r + 1}`}
                    onClick={() =>
                      focusAfter(`${row.key}-add`, () =>
                        update((rows) =>
                          rows.map((item) =>
                            item.key === row.key
                              ? {
                                  ...item,
                                  components: item.components.filter(
                                    (item) => item.key !== button.key,
                                  ),
                                }
                              : item,
                          ),
                        ),
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </div>
              <TextControl
                id={`${button.key}-label`}
                path={`components.${r}.components.${b}.label`}
                label="Button label"
                untrimmed
                value={button.label}
                max={discordLimits.buttonLabel}
                onChange={(label) =>
                  changeButton(row.key, button.key, { label })
                }
              />
              <TextControl
                id={`${button.key}-url`}
                path={`components.${r}.components.${b}.url`}
                label="Button URL"
                untrimmed
                link
                value={button.url}
                max={discordLimits.buttonUrl}
                onChange={(url) => changeButton(row.key, button.key, { url })}
              />
              <TextControl
                id={`${button.key}-emoji`}
                path={`components.${r}.components.${b}.emoji`}
                label="Button emoji"
                optional
                value={
                  button.emoji
                    ? button.emoji.id
                      ? `<${button.emoji.animated ? "a" : ""}:${button.emoji.name}:${button.emoji.id}>`
                      : button.emoji.name
                    : ""
                }
                placeholder="🔗 or <:name:123456789012345678>"
                onChange={(value) => {
                  const custom = /^<(a?):([^:]+):(\d+)>$/.exec(value);
                  changeButton(row.key, button.key, {
                    emoji: value
                      ? custom
                        ? {
                            name: custom[2]!,
                            id: custom[3]!,
                            animated: custom[1] === "a",
                          }
                        : { name: value }
                      : undefined,
                  });
                }}
              />
            </div>
          ))}
          <button
            id={`${row.key}-add`}
            type="button"
            disabled={row.components.length >= discordLimits.buttonsPerRow}
            onClick={() => {
              const button = blankButton();
              focusAfter(`${button.key}-label`, () =>
                update((rows) =>
                  rows.map((item) =>
                    item.key === row.key
                      ? { ...item, components: [...item.components, button] }
                      : item,
                  ),
                ),
              );
            }}
          >
            <Plus aria-hidden="true" /> Add button to row {r + 1}
          </button>
        </div>
      ))}
      <button
        id="buttons-add-row"
        type="button"
        disabled={rows.length >= discordLimits.buttonRows}
        onClick={() => {
          const button = blankButton();
          const row: ButtonRow = {
            type: 1,
            key: newId(),
            components: [button],
          };
          focusAfter(`${button.key}-label`, () =>
            update((rows) => [...rows, row]),
          );
        }}
      >
        <Plus aria-hidden="true" /> Add button row
      </button>
    </section>
  );
}
