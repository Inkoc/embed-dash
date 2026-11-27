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
  CircleAlert,
  Eraser,
  GripVertical,
  Monitor,
  Plus,
  Smartphone,
} from "lucide-react";
import { discordLimits, messageEmbedTextLength } from "@embed-dash/shared";
import { useBot } from "../bot";
import { DiscordPreview } from "../preview/DiscordPreview";
import type { Theme } from "../theme";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ForwardKeys, forwardShortcut } from "../ui/Keys";
import { Segmented, segmentedItem } from "../ui/Segmented";
import { BudgetRuler } from "./BudgetRuler";
import { addEmbed, blankDraft, blankEmbed, useDraft } from "./draft";
import { useEditorState } from "./editorState";
import { EmbedEditor } from "./EmbedEditor";
import { TextControl } from "./TextControl";
import { stackedQuery, usePreviewWidth } from "./usePreviewWidth";
import styles from "./ComposeView.module.css";

const format = (n: number) => n.toLocaleString("en-GB");

export function ComposeView({ theme }: { theme: Theme }) {
  const { draft, setDraft, saved } = useDraft();
  const { pane, setPane, focusAfter, reset } = useEditorState();
  const bot = useBot();
  const [confirmClear, setConfirmClear] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const width = usePreviewWidth({ frame, column, editor });
  const time = useMemo(
    () =>
      `Today at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    [],
  );
  const embedCount = draft.embeds.length;

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
  }, [pane, setPane]);

  const clear = () => {
    setConfirmClear(false);
    focusAfter("in-content", () => {
      reset();
      setDraft(() => blankDraft());
    });
  };

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
            total={messageEmbedTextLength(draft.embeds)}
            max={discordLimits.embedTotal}
          />
          <div className={styles.draftState}>
            <p className={styles.saved} role="status">
              {saved
                ? "Saved in this browser"
                : "Not saved: this browser blocks storage"}
            </p>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => setConfirmClear(true)}
            >
              <Eraser aria-hidden="true" />
              Clear
            </button>
          </div>
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
          aria-label="Message editor"
          onSubmit={(event) => event.preventDefault()}
        >
          <section className={styles.section} aria-labelledby="s-message">
            <div className={styles.sectionHead}>
              <h3 id="s-message">Message</h3>
            </div>
            <TextControl
              id="in-content"
              path="content"
              label="Message text"
              optional
              rows={2}
              format
              untrimmed
              max={discordLimits.content}
              value={draft.content}
              onChange={(content) =>
                setDraft((current) => ({ ...current, content }))
              }
              focusHint="Shown above the embeds in the channel."
            />
          </section>

          {draft.embeds.map((embed, index) => (
            <EmbedEditor
              key={embed.id}
              embed={embed}
              index={index}
              count={embedCount}
            />
          ))}

          <section className={styles.addSection} aria-label="Embeds">
            {embedCount < discordLimits.embedsPerMessage ? (
              <button
                type="button"
                id="add-embed"
                className={styles.add}
                onClick={() => {
                  const embed = blankEmbed();
                  focusAfter(`${embed.id}-title`, () =>
                    setDraft((current) => addEmbed(current, embed)),
                  );
                }}
              >
                <Plus aria-hidden="true" />
                Add embed
              </button>
            ) : (
              <p id="add-embed" tabIndex={-1} className={styles.full}>
                A message holds at most {discordLimits.embedsPerMessage} embeds.
              </p>
            )}
            <span className={styles.aside}>
              {embedCount} of {discordLimits.embedsPerMessage}
            </span>
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
        <NextStep />
      </aside>
      <ConfirmDialog
        open={confirmClear}
        title="Clear the draft?"
        confirmLabel="Clear draft"
        onConfirm={clear}
        onCancel={() => setConfirmClear(false)}
      >
        <p>
          This removes the message text and every embed from this browser. It
          can’t be undone.
        </p>
      </ConfirmDialog>
    </section>
  );
}

const plural = (n: number) => `${n} ${n === 1 ? "problem" : "problems"}`;
/** Long lists stay short beside the preview; fixing the first ones brings the rest up. */
const listed = 5;

/** The way to Send, or what stands in its way. */
function NextStep() {
  const { issues } = useDraft();
  const { reveal } = useEditorState();
  if (issues.length === 0)
    return (
      <div className={styles.next}>
        <p>
          <b>Looks right?</b> Pick where it goes next.
        </p>
        <ChooseChannels describedBy="problems-title" />
      </div>
    );
  return (
    <div className={styles.next} data-blocked="">
      <h3 id="problems-title" className={styles.problemsTitle}>
        <CircleAlert aria-hidden="true" />
        {plural(issues.length)} to fix before sending
      </h3>
      <ul className={styles.problems}>
        {issues.slice(0, listed).map((issue, index) => (
          <li key={`${issue.path}-${index}`}>
            <button type="button" onClick={() => reveal(issue.path)}>
              <b>{issue.label}:</b> {issue.message}
            </button>
          </li>
        ))}
      </ul>
      {issues.length > listed && (
        <p className={styles.more}>
          and {plural(issues.length - listed)} more, listed here as you fix
          these.
        </p>
      )}
      <ChooseChannels describedBy="problems-title" />
    </div>
  );
}

/** While the draft has problems the action stays visible but disabled, and pressing it goes to the first one. */
function ChooseChannels({ describedBy }: { describedBy: string }) {
  const { issues } = useDraft();
  const { reveal } = useEditorState();
  const content = (
    <>
      Choose channels
      <ArrowRight aria-hidden="true" />
      <ForwardKeys />
    </>
  );
  if (issues.length > 0)
    return (
      <button
        type="button"
        className={styles.primary}
        aria-disabled="true"
        aria-describedby={describedBy}
        aria-keyshortcuts={forwardShortcut}
        onClick={() => reveal(issues[0]!.path)}
      >
        {content}
      </button>
    );
  return (
    <Link
      to="/send"
      className={styles.primary}
      aria-keyshortcuts={forwardShortcut}
    >
      {content}
    </Link>
  );
}

/** Pinned to the bottom on phones; kept outside the animated view so it stays fixed. */
export function ComposeActionBar() {
  const { draft, issues } = useDraft();
  const { reveal } = useEditorState();
  return (
    <div className={styles.actionBar}>
      {issues.length > 0 ? (
        <button
          type="button"
          className={styles.fixFirst}
          onClick={() => reveal(issues[0]!.path)}
        >
          <CircleAlert aria-hidden="true" />
          <span id="problems-count">{plural(issues.length)} to fix</span>
        </button>
      ) : (
        <p className={styles.actionMeta}>
          <span className="visually-hidden">Embed text: </span>
          {format(messageEmbedTextLength(draft.embeds))}
          <span aria-hidden="true"> / </span>
          <span className="visually-hidden"> of </span>
          {format(discordLimits.embedTotal)}
        </p>
      )}
      <ChooseChannels describedBy="problems-count" />
    </div>
  );
}
