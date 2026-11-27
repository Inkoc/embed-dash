import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  GripVertical,
  Link as LinkIcon,
  Monitor,
  Smartphone,
} from "lucide-react";
import { discordLimits, embedTextLength } from "@embed-dash/shared";
import { useBot } from "../bot";
import { DiscordPreview } from "../preview/DiscordPreview";
import type { Theme } from "../theme";
import { ForwardKeys, forwardShortcut } from "../ui/Keys";
import { Segmented, segmentedItem } from "../ui/Segmented";
import { BudgetRuler } from "./BudgetRuler";
import { useDraft, type Draft } from "./draft";
import { TextControl } from "./TextControl";
import { stackedQuery, usePreviewWidth } from "./usePreviewWidth";
import styles from "./ComposeView.module.css";

type Pane = "edit" | "preview";

const displayUrl = (url: string) => url.replace(/^https?:\/\//, "");

function embedText(draft: Draft) {
  return embedTextLength({
    title: draft.title,
    description: draft.description,
    fields: draft.fields,
    footer: draft.footer,
    author: draft.author,
  });
}

function partSummaries(draft: Draft) {
  const images = [
    draft.image && "large image",
    draft.thumbnail && "thumbnail",
  ].filter(Boolean);
  const footer = [
    draft.footer.text.trim(),
    draft.timestamp && "send time shown",
  ].filter(Boolean);
  return [
    {
      name: "Author",
      summary: draft.author.name.trim()
        ? `${draft.author.name.trim()}${draft.author.iconUrl ? ", with icon" : ""}`
        : "Not used",
    },
    {
      name: "Images",
      summary: images.length
        ? `${images.join(" and ").replace(/^./, (c) => c.toUpperCase())} set`
        : "Not used",
    },
    {
      name: "Footer and time",
      summary: footer.length ? footer.join(" · ") : "Not used",
    },
  ];
}

export function ComposeView({ theme }: { theme: Theme }) {
  const [draft, update] = useDraft();
  const bot = useBot();
  const [pane, setPane] = useState<Pane>("edit");
  const frame = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const width = usePreviewWidth({ frame, column, editor });
  const time = useMemo(
    () =>
      `Today at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    [],
  );

  // On phones Esc steps back from the preview pane to the editor.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        pane === "preview" &&
        matchMedia(stackedQuery).matches
      ) {
        event.preventDefault();
        setPane("edit");
        document.getElementById("pane-edit")?.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [pane]);

  return (
    <section
      className={styles.compose}
      aria-labelledby="compose-title"
      data-pane={pane}
      style={{ "--preview-w": `${width.requested}px` } as CSSProperties}
    >
      <div className={styles.editor} ref={editor}>
        <div className={styles.head}>
          <h2 id="compose-title" tabIndex={-1}>
            Compose
          </h2>
          <BudgetRuler
            total={embedText(draft)}
            max={discordLimits.embedTotal}
          />
        </div>

        <Segmented
          activeKey={pane}
          role="group"
          aria-label="Show"
          className={styles.paneToggle}
        >
          {(["edit", "preview"] as const).map((name) => (
            <button
              key={name}
              type="button"
              id={`pane-${name}`}
              className={segmentedItem}
              aria-pressed={pane === name}
              aria-controls={name === "edit" ? "editor" : "preview"}
              data-active={pane === name || undefined}
              onClick={() => setPane(name)}
            >
              {name === "edit" ? "Edit" : "Preview"}
            </button>
          ))}
        </Segmented>

        <form
          id="editor"
          className={styles.sheet}
          aria-label="Embed editor"
          onSubmit={(event) => event.preventDefault()}
        >
          <section className={styles.section} aria-labelledby="s-message">
            <div className={styles.sectionHead}>
              <h3 id="s-message">Message</h3>
            </div>
            <TextControl
              id="in-content"
              label="Message text"
              optional
              rows={2}
              max={discordLimits.content}
              value={draft.content}
              onChange={(content) => update({ content })}
              focusHint="Shown above the embed in the channel."
            />
          </section>

          <section className={styles.section} aria-labelledby="s-embed">
            <div className={styles.sectionHead}>
              <h3 id="s-embed">Embed</h3>
              <span className={styles.colour}>
                <label htmlFor="in-color">Side colour</label>
                <input
                  id="in-color"
                  type="color"
                  value={draft.color}
                  onChange={(event) => update({ color: event.target.value })}
                />
                <output htmlFor="in-color">{draft.color.toUpperCase()}</output>
              </span>
            </div>
            <div className={styles.stack}>
              <div>
                <TextControl
                  id="in-title"
                  label="Title"
                  max={discordLimits.title}
                  value={draft.title}
                  onChange={(title) => update({ title })}
                />
                {draft.url && (
                  <p className={styles.linkline}>
                    <LinkIcon aria-hidden="true" />
                    <span>
                      Title links to <b>{displayUrl(draft.url)}</b>
                    </span>
                  </p>
                )}
              </div>
              <TextControl
                id="in-description"
                label="Description"
                rows={5}
                max={discordLimits.description}
                value={draft.description}
                onChange={(description) => update({ description })}
              />
            </div>
          </section>

          <section className={styles.section} aria-labelledby="s-fields">
            <div className={styles.sectionHead}>
              <h3 id="s-fields">Fields</h3>
              <span className={styles.aside}>
                {draft.fields.length} of {discordLimits.fields}
              </span>
            </div>
            <ol className={styles.rows} aria-labelledby="s-fields">
              {draft.fields.map((field, index) => (
                <li key={index} className={styles.fieldRow}>
                  <span className={styles.fieldNo}>
                    <span className="visually-hidden">Field </span>
                    {index + 1}
                  </span>
                  <span className={styles.fieldText}>
                    <span className={styles.fieldName}>{field.name}</span>
                    <span className="visually-hidden">: </span>
                    <span className={styles.fieldValue}>{field.value}</span>
                  </span>
                  <span className={styles.fieldTag}>
                    {field.inline ? "Inline" : "Full width"}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.section} aria-labelledby="s-parts">
            <div className={styles.sectionHead}>
              <h3 id="s-parts">Optional parts</h3>
            </div>
            <dl className={styles.rows}>
              {partSummaries(draft).map((part) => (
                <div key={part.name} className={styles.partRow}>
                  <dt>{part.name}</dt>
                  <dd>{part.summary}</dd>
                </div>
              ))}
            </dl>
          </section>
        </form>
      </div>

      <div
        className={styles.handle}
        aria-label="Resize preview"
        aria-controls="preview"
        title="Drag to resize the preview, or use the arrow keys"
        {...width.handle}
      >
        <span className={styles.grip}>
          <GripVertical aria-hidden="true" />
        </span>
      </div>

      <aside
        id="preview"
        ref={column}
        className={styles.previewColumn}
        aria-label="Preview"
      >
        <div className={styles.widthBar}>
          <span id="width-label" className={styles.widthLabel}>
            Width
          </span>
          <Segmented
            activeKey={width.preset ?? null}
            aria-labelledby="width-label"
            role="group"
          >
            {(
              [
                ["desktop", "Desktop", Monitor],
                ["phone", "Phone", Smartphone],
              ] as const
            ).map(([name, label, Icon]) => (
              <button
                key={name}
                type="button"
                className={segmentedItem}
                aria-pressed={width.preset === name}
                data-active={width.preset === name || undefined}
                onClick={() => width.choose(name)}
              >
                <Icon aria-hidden="true" />
                {label}
              </button>
            ))}
          </Segmented>
          <span className={styles.readout}>{width.actual} px</span>
        </div>
        <div className={styles.frame} ref={frame}>
          <p className={styles.strip}>
            <span className={styles.live}>Live preview</span>
            <span>{theme === "dark" ? "Discord dark" : "Discord light"}</span>
          </p>
          <DiscordPreview
            draft={draft}
            bot={bot.data}
            botPending={bot.isPending}
            time={time}
          />
        </div>
        <div className={styles.next}>
          <p>
            <b>Looks right?</b> Pick where it goes next.
          </p>
          <ChooseChannels />
        </div>
      </aside>
    </section>
  );
}

function ChooseChannels() {
  return (
    <Link
      to="/send"
      className={styles.primary}
      aria-keyshortcuts={forwardShortcut}
    >
      Choose channels
      <ArrowRight aria-hidden="true" />
      <ForwardKeys />
    </Link>
  );
}

/** Pinned to the bottom on phones; kept outside the animated view so it stays fixed. */
export function ComposeActionBar() {
  const [draft] = useDraft();
  return (
    <div className={styles.actionBar}>
      <p className={styles.actionMeta}>
        <span className="visually-hidden">Embed text: </span>
        {embedText(draft).toLocaleString("en-GB")}
        <span aria-hidden="true"> / </span>
        <span className="visually-hidden"> of </span>
        {discordLimits.embedTotal.toLocaleString("en-GB")}
      </p>
      <ChooseChannels />
    </div>
  );
}
