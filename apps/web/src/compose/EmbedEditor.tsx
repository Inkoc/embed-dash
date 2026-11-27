import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleAlert,
  Copy,
  Link as LinkIcon,
  Plus,
  Trash2,
} from "lucide-react";
import { discordLimits } from "@embed-dash/shared";
import {
  addField,
  copyOf,
  duplicateEmbed,
  moveEmbed,
  moveField,
  newId,
  removeEmbed,
  removeField,
  updateEmbed,
  updateField,
  useDraft,
  type Embed,
  type EmbedField,
} from "./draft";
import { Disclosure } from "./Disclosure";
import { useEditorState } from "./editorState";
import { localInputValue } from "./FormatEditor";
import { Problem, TextControl, useProblem } from "./TextControl";
import styles from "./EmbedEditor.module.css";

const displayUrl = (url: string) => url.trim().replace(/^https?:\/\//, "");
const hexColor = /^#[0-9a-f]{6}$/i;

/** Accepts the hex forms people paste (`0d9488`, `#0D9488`, `#09a`) and stores `#rrggbb`. */
export function normaliseHex(input: string) {
  const value = input.trim().replace(/^#?/, "#");
  if (/^#[0-9a-f]{3}$/i.test(value))
    return `#${[...value.slice(1)].map((c) => c + c).join("")}`.toLowerCase();
  return hexColor.test(value) ? value.toLowerCase() : input;
}

/** "Not used" lines say what opening the row is for. */
export function partSummaries(embed: Embed) {
  const images = [
    embed.image.trim() && "large image",
    embed.thumbnail.trim() && "thumbnail",
  ].filter(Boolean);
  const time =
    embed.timestamp === "now"
      ? "time of sending"
      : embed.timestamp
        ? new Date(embed.timestamp).toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "";
  const footer = [embed.footer.text.trim(), time].filter(Boolean);
  const author = embed.author.name.trim();
  return {
    author: author
      ? [
          author,
          embed.author.url.trim() && "linked",
          embed.author.iconUrl.trim() && "with icon",
        ]
          .filter(Boolean)
          .join(", ")
      : "Not used. Open to add a name, link and icon.",
    images: images.length
      ? `${images.join(" and ").replace(/^./, (c) => c.toUpperCase())} set`
      : "Not used. Open to add an image or thumbnail.",
    footer: footer.length
      ? footer.join(" · ")
      : "Not used. Open to add footer text or a time.",
  };
}

interface Props {
  embed: Embed;
  index: number;
  count: number;
}

export function EmbedEditor({ embed, index, count }: Props) {
  const { draft, setDraft, issues } = useDraft();
  const { focusAfter, isTouched, isOpen, setOpen } = useEditorState();
  const [moved, setMoved] = useState<string | null>(null);
  const e = embed.id;
  // With several embeds, each can fold to one line so the message stays scannable.
  const foldable = count > 1;
  const folded = foldable && isOpen(`${e}:folded`);
  const at = `embeds.${index}`;
  const n = index + 1;
  const change = (patch: (embed: Embed) => Partial<Embed>) =>
    setDraft((draft) => updateEmbed(draft, e, patch));
  const hasIssue = (...paths: string[]) =>
    issues.some((issue) =>
      paths.some((path) =>
        path
          ? issue.path.startsWith(`${at}.${path}`)
          : issue.path === at || issue.path.startsWith(`${at}.`),
      ),
    );
  const summaries = partSummaries(embed);
  const embedProblem = isTouched(`${e}-head`)
    ? issues.find((issue) => issue.path === at)?.message
    : undefined;

  const remove = () => {
    const rest = draft.embeds.filter((other) => other.id !== e);
    const neighbour = rest[Math.min(index, rest.length - 1)];
    focusAfter(neighbour ? `${neighbour.id}-head` : "add-embed", () =>
      setDraft((current) => removeEmbed(current, e)),
    );
  };
  const move = (by: -1 | 1) => {
    const to = index + by;
    const keep = (by === -1 && to === 0) || (by === 1 && to === count - 1);
    const target = keep
      ? by === -1
        ? "down"
        : "up"
      : by === -1
        ? "up"
        : "down";
    focusAfter(`${e}-${target}`, () => {
      setDraft((draft) => moveEmbed(draft, e, by));
      setMoved(e);
    });
  };

  return (
    <section
      className={styles.embed}
      aria-labelledby={`${e}-head`}
      data-moved={moved === e || undefined}
      onAnimationEnd={() => setMoved(null)}
    >
      <div className={styles.head}>
        <h3 id={`${e}-head`} tabIndex={-1}>
          {foldable ? (
            <button
              type="button"
              id={`${e}-fold`}
              className={styles.fold}
              aria-expanded={!folded}
              aria-controls={`${e}-body`}
              onClick={() => setOpen(`${e}:folded`, !folded)}
            >
              <ChevronDown className={styles.chevron} aria-hidden="true" />
              <span>
                Embed {n}
                <span className="visually-hidden"> of {count}</span>
              </span>
              {folded && (
                <FoldedSummary embed={embed} needsFix={hasIssue("")} />
              )}
            </button>
          ) : (
            <>Embed {n}</>
          )}
        </h3>
        {!folded && (
          <ColourControl
            embed={embed}
            path={`${at}.color`}
            onChange={(color) => change(() => ({ color }))}
          />
        )}
      </div>
      <div id={`${e}-body`} className={styles.body} hidden={folded}>
        <Problem id={`${e}-problem`} message={embedProblem} />

        <div className={styles.stack}>
          <div>
            <TextControl
              id={`${e}-title`}
              path={`${at}.title`}
              label="Title"
              max={discordLimits.title}
              value={embed.title}
              onChange={(title) => change(() => ({ title }))}
            />
            <Disclosure
              openKey={`${e}:url`}
              id={`${e}-link`}
              className={styles.linkPart}
              headClassName={styles.linkHead}
              needsFix={hasIssue("url")}
              head={
                <>
                  <LinkIcon aria-hidden="true" />
                  {embed.url.trim() ? (
                    <span className={styles.linkText}>
                      Title links to <b>{displayUrl(embed.url)}</b>
                    </span>
                  ) : (
                    <span className={styles.linkText}>Title link</span>
                  )}
                  <span className={styles.linkAction}>
                    {embed.url.trim() ? "Change" : "Add"}
                  </span>
                </>
              }
            >
              <div className={styles.linkBody}>
                <TextControl
                  id={`${e}-url`}
                  path={`${at}.url`}
                  label="Title link"
                  optional
                  link
                  placeholder="https://…"
                  value={embed.url}
                  onChange={(url) => change(() => ({ url }))}
                />
              </div>
            </Disclosure>
          </div>
          <TextControl
            id={`${e}-description`}
            path={`${at}.description`}
            label="Description"
            rows={5}
            format
            max={discordLimits.description}
            value={embed.description}
            onChange={(description) => change(() => ({ description }))}
          />
        </div>

        <FieldList embed={embed} index={index} />

        <div className={styles.subHead}>
          <h4>Optional parts</h4>
        </div>
        <div className={styles.rows}>
          <Part
            openKey={`${e}:author`}
            id={`${e}-author`}
            name="Author"
            summary={summaries.author}
            needsFix={hasIssue("author")}
          >
            <TextControl
              id={`${e}-author-name`}
              path={`${at}.author.name`}
              label="Author name"
              max={discordLimits.authorName}
              value={embed.author.name}
              onChange={(name) =>
                change((embed) => ({ author: { ...embed.author, name } }))
              }
            />
            <TextControl
              id={`${e}-author-url`}
              path={`${at}.author.url`}
              label="Author link"
              optional
              link
              placeholder="https://…"
              value={embed.author.url}
              onChange={(url) =>
                change((embed) => ({ author: { ...embed.author, url } }))
              }
            />
            <TextControl
              id={`${e}-author-iconUrl`}
              path={`${at}.author.iconUrl`}
              label="Author icon link"
              optional
              link
              placeholder="https://…"
              value={embed.author.iconUrl}
              onChange={(iconUrl) =>
                change((embed) => ({ author: { ...embed.author, iconUrl } }))
              }
            />
          </Part>
          <Part
            openKey={`${e}:images`}
            id={`${e}-images`}
            name="Images"
            summary={summaries.images}
            needsFix={hasIssue("image", "thumbnail")}
          >
            <TextControl
              id={`${e}-image`}
              path={`${at}.image`}
              label="Large image link"
              optional
              link
              placeholder="https://…"
              focusHint="Shown full width under the text."
              value={embed.image}
              onChange={(image) => change(() => ({ image }))}
            />
            <TextControl
              id={`${e}-thumbnail`}
              path={`${at}.thumbnail`}
              label="Thumbnail link"
              optional
              link
              placeholder="https://…"
              focusHint="A small image at the top right."
              value={embed.thumbnail}
              onChange={(thumbnail) => change(() => ({ thumbnail }))}
            />
          </Part>
          <Part
            openKey={`${e}:footer`}
            id={`${e}-footer`}
            name="Footer and time"
            summary={summaries.footer}
            needsFix={hasIssue("footer", "timestamp")}
          >
            <TextControl
              id={`${e}-footer-text`}
              path={`${at}.footer.text`}
              label="Footer text"
              max={discordLimits.footerText}
              value={embed.footer.text}
              onChange={(text) =>
                change((embed) => ({ footer: { ...embed.footer, text } }))
              }
            />
            <TextControl
              id={`${e}-footer-iconUrl`}
              path={`${at}.footer.iconUrl`}
              label="Footer icon link"
              optional
              link
              placeholder="https://…"
              value={embed.footer.iconUrl}
              onChange={(iconUrl) =>
                change((embed) => ({ footer: { ...embed.footer, iconUrl } }))
              }
            />
            <TimeControl
              id={`${e}-time`}
              value={embed.timestamp}
              onChange={(timestamp) => change(() => ({ timestamp }))}
            />
          </Part>
        </div>
      </div>

      <div className={styles.actions} role="group" aria-label={`Embed ${n}`}>
        <button
          type="button"
          id={`${e}-duplicate`}
          className={styles.quiet}
          disabled={count >= discordLimits.embedsPerMessage}
          onClick={() => {
            const copy = copyOf(embed);
            focusAfter(`${copy.id}-head`, () =>
              setDraft((draft) => duplicateEmbed(draft, e, copy)),
            );
          }}
        >
          <Copy aria-hidden="true" />
          Duplicate
        </button>
        <button type="button" className={styles.quiet} onClick={remove}>
          <Trash2 aria-hidden="true" />
          Remove<span className="visually-hidden"> embed {n}</span>
        </button>
        {count > 1 && (
          <span className={styles.order}>
            <button
              type="button"
              id={`${e}-up`}
              className={styles.quiet}
              disabled={index === 0}
              onClick={() => move(-1)}
            >
              <ArrowUp aria-hidden="true" />
              Move up<span className="visually-hidden"> embed {n}</span>
            </button>
            <button
              type="button"
              id={`${e}-down`}
              className={styles.quiet}
              disabled={index === count - 1}
              onClick={() => move(1)}
            >
              <ArrowDown aria-hidden="true" />
              Move down<span className="visually-hidden"> embed {n}</span>
            </button>
          </span>
        )}
      </div>
    </section>
  );
}

/** A folded embed in one line: its colour, what it says, how many fields, and whether it needs a fix. */
function FoldedSummary({
  embed,
  needsFix,
}: {
  embed: Embed;
  needsFix: boolean;
}) {
  const text =
    embed.title.trim() ||
    embed.description.trim().split("\n")[0] ||
    embed.author.name.trim() ||
    "Nothing written yet";
  const fields = embed.fields.length;
  return (
    <>
      <span
        className={styles.dot}
        style={
          hexColor.test(embed.color)
            ? ({ "--embed-color": embed.color } as CSSProperties)
            : undefined
        }
        aria-hidden="true"
      />
      <span className={styles.foldText}>
        <span className="visually-hidden">: </span>
        {text}
      </span>
      {fields > 0 && (
        <span className={styles.foldMeta}>
          {fields} {fields === 1 ? "field" : "fields"}
        </span>
      )}
      {needsFix && (
        <span className={styles.foldFix}>
          <CircleAlert aria-hidden="true" />
          Needs a fix
        </span>
      )}
    </>
  );
}

function Part({
  openKey,
  id,
  name,
  summary,
  needsFix,
  children,
}: {
  openKey: string;
  id: string;
  name: string;
  summary: string;
  needsFix: boolean;
  children: ReactNode;
}) {
  return (
    <Disclosure
      openKey={openKey}
      id={id}
      className={styles.row}
      headClassName={styles.partHead}
      needsFix={needsFix}
      head={
        <>
          <span className={styles.partName}>{name}</span>
          <span className={styles.partSummary}>{summary}</span>
        </>
      }
    >
      <div className={styles.partBody}>{children}</div>
    </Disclosure>
  );
}

function ColourControl({
  embed,
  path,
  onChange,
}: {
  embed: Embed;
  path: string;
  onChange: (color: string) => void;
}) {
  const { touch } = useEditorState();
  const id = `${embed.id}-hex`;
  const problem = useProblem(id, path);
  const valid = hexColor.test(embed.color);
  return (
    <div className={styles.colour}>
      <label htmlFor={id}>Side colour</label>
      <input
        type="color"
        className={styles.swatch}
        aria-label="Pick the side colour"
        value={valid ? embed.color.toLowerCase() : "#000000"}
        onChange={(event) => onChange(event.target.value)}
      />
      <input
        id={id}
        className={styles.hex}
        value={embed.color.toUpperCase()}
        spellCheck={false}
        autoComplete="off"
        maxLength={7}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-problem` : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => {
          onChange(normaliseHex(event.target.value));
          touch(id);
        }}
      />
      <Problem id={`${id}-problem`} message={problem} />
    </div>
  );
}

function TimeControl({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (timestamp: string) => void;
}) {
  const mode = value === "" ? "none" : value === "now" ? "now" : "set";
  const local = mode === "set" ? localInputValue(new Date(value)) : "";
  const options = [
    ["none", "No time"],
    ["now", "Time of sending"],
    ["set", "A set time"],
  ] as const;
  return (
    <fieldset className={styles.time}>
      <legend>Time in the footer</legend>
      <div className={styles.choices}>
        {options.map(([key, label]) => (
          <label key={key} className={styles.choice}>
            <input
              type="radio"
              name={id}
              id={key === mode ? id : undefined}
              checked={mode === key}
              onChange={() =>
                onChange(
                  key === "none"
                    ? ""
                    : key === "now"
                      ? "now"
                      : new Date(new Date().setSeconds(0, 0)).toISOString(),
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
      {mode === "set" && (
        <div className={styles.when}>
          <label htmlFor={`${id}-at`}>Date and time</label>
          <input
            id={`${id}-at`}
            type="datetime-local"
            value={local}
            onChange={(event) => {
              // A cleared picker keeps the last time rather than dropping the choice.
              const date = new Date(event.target.value);
              if (!Number.isNaN(date.getTime())) onChange(date.toISOString());
            }}
          />
        </div>
      )}
    </fieldset>
  );
}

function FieldList({ embed, index }: { embed: Embed; index: number }) {
  const { setDraft, issues } = useDraft();
  const { focusAfter, setOpen } = useEditorState();
  const [moved, setMoved] = useState<string | null>(null);
  const e = embed.id;
  const at = `embeds.${index}.fields`;
  const fields = embed.fields;
  const full = fields.length >= discordLimits.fields;

  const add = () => {
    const field: EmbedField = {
      id: newId(),
      name: "",
      value: "",
      inline: true,
    };
    focusAfter(`${field.id}-name`, () => {
      setDraft((draft) => addField(draft, e, field));
      setOpen(field.id, true);
    });
  };
  const move = (field: EmbedField, i: number, by: -1 | 1) => {
    const to = i + by;
    const keep =
      (by === -1 && to === 0) || (by === 1 && to === fields.length - 1);
    const target = keep
      ? by === -1
        ? "down"
        : "up"
      : by === -1
        ? "up"
        : "down";
    focusAfter(`${field.id}-${target}`, () => {
      setDraft((draft) => moveField(draft, e, field.id, by));
      setMoved(field.id);
    });
  };
  const remove = (field: EmbedField, i: number) => {
    const rest = fields.filter((f) => f.id !== field.id);
    const neighbour = rest[Math.min(i, rest.length - 1)];
    focusAfter(neighbour ? `${neighbour.id}-toggle` : `${e}-add-field`, () =>
      setDraft((draft) => removeField(draft, e, field.id)),
    );
  };

  return (
    <>
      <div className={styles.subHead}>
        <h4 id={`${e}-fields`} tabIndex={-1}>
          Fields
        </h4>
        <span className={styles.aside}>
          {fields.length} of {discordLimits.fields}
        </span>
      </div>
      {fields.length > 0 && (
        <ol className={styles.rows} aria-labelledby={`${e}-fields`}>
          {fields.map((field, i) => {
            const fieldAt = `${at}.${i}`;
            const needsFix = issues.some((issue) =>
              issue.path.startsWith(`${fieldAt}.`),
            );
            return (
              <li
                key={field.id}
                className={styles.row}
                data-moved={moved === field.id || undefined}
                onAnimationEnd={() => setMoved(null)}
              >
                <Disclosure
                  openKey={field.id}
                  id={field.id}
                  headClassName={styles.fieldHead}
                  needsFix={needsFix}
                  head={
                    <>
                      <span className={styles.fieldNo}>
                        <span className="visually-hidden">Field </span>
                        {i + 1}
                      </span>
                      <span className={styles.fieldText}>
                        <span
                          className={styles.fieldName}
                          data-empty={!field.name.trim() || undefined}
                        >
                          {field.name.trim() || "No name yet"}
                        </span>
                        <span className="visually-hidden">: </span>
                        <span className={styles.fieldValue}>
                          {field.value.trim() || "No value yet"}
                        </span>
                      </span>
                      {!needsFix && (
                        <span className={styles.fieldTag}>
                          {field.inline ? "Inline" : "Full width"}
                        </span>
                      )}
                    </>
                  }
                >
                  <div className={styles.fieldBody}>
                    <TextControl
                      id={`${field.id}-name`}
                      path={`${fieldAt}.name`}
                      label="Name"
                      max={discordLimits.fieldName}
                      value={field.name}
                      onChange={(name) =>
                        setDraft((draft) =>
                          updateField(draft, e, field.id, { name }),
                        )
                      }
                    />
                    <TextControl
                      id={`${field.id}-value`}
                      path={`${fieldAt}.value`}
                      label="Value"
                      rows={3}
                      format
                      max={discordLimits.fieldValue}
                      value={field.value}
                      onChange={(value) =>
                        setDraft((draft) =>
                          updateField(draft, e, field.id, { value }),
                        )
                      }
                    />
                    <div className={styles.fieldActions}>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={field.inline}
                          onChange={(event) =>
                            setDraft((draft) =>
                              updateField(draft, e, field.id, {
                                inline: event.target.checked,
                              }),
                            )
                          }
                        />
                        Inline: sits beside other inline fields
                      </label>
                      <span className={styles.order}>
                        {fields.length > 1 && (
                          <>
                            <button
                              type="button"
                              id={`${field.id}-up`}
                              className={styles.quiet}
                              disabled={i === 0}
                              onClick={() => move(field, i, -1)}
                            >
                              <ArrowUp aria-hidden="true" />
                              Up
                              <span className="visually-hidden">
                                {" "}
                                field {i + 1}
                              </span>
                            </button>
                            <button
                              type="button"
                              id={`${field.id}-down`}
                              className={styles.quiet}
                              disabled={i === fields.length - 1}
                              onClick={() => move(field, i, 1)}
                            >
                              <ArrowDown aria-hidden="true" />
                              Down
                              <span className="visually-hidden">
                                {" "}
                                field {i + 1}
                              </span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className={styles.quiet}
                          onClick={() => remove(field, i)}
                        >
                          <Trash2 aria-hidden="true" />
                          Remove
                          <span className="visually-hidden">
                            {" "}
                            field {i + 1}
                          </span>
                        </button>
                      </span>
                    </div>
                  </div>
                </Disclosure>
              </li>
            );
          })}
        </ol>
      )}
      {full ? (
        <p className={styles.full}>
          An embed holds at most {discordLimits.fields} fields.
        </p>
      ) : (
        <button
          type="button"
          id={`${e}-add-field`}
          className={`${styles.quiet} ${styles.add}`}
          onClick={add}
        >
          <Plus aria-hidden="true" />
          Add field
        </button>
      )}
    </>
  );
}
