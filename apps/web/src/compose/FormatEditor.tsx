import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import {
  AtSign,
  Bold,
  Clock,
  Code,
  EyeOff,
  Heading,
  Italic,
  Link,
  List,
  SquareCode,
  Strikethrough,
  TextQuote,
  Underline,
  type LucideIcon,
} from "lucide-react";
import { isApplePlatform } from "../shortcuts";
import {
  applyEdit,
  codeBlock,
  insertSnippet,
  isSnowflake,
  link,
  mention,
  timestamp,
  timestampStyles,
  toggleLinePrefix,
  toggleWrap,
  type Edit,
  type MentionKind,
  type TimestampStyle,
} from "./markdown";
import { formatTimestamp } from "../preview/timestamp";
import styles from "./FormatEditor.module.css";
import choice from "../ui/Choice.module.css";

type Panel = "mention" | "timestamp";
interface Command {
  name: string;
  icon: LucideIcon;
  /** The letter used with Ctrl or ⌘. */
  key?: string;
  run?: (text: string, start: number, end: number) => Edit;
  panel?: Panel;
}

const wrap =
  (marker: string, placeholder: string) =>
  (text: string, start: number, end: number) =>
    toggleWrap(text, start, end, marker, placeholder);
const prefix = (marker: string) => (text: string, start: number, end: number) =>
  toggleLinePrefix(text, start, end, marker);

/** Grouped as Discord's own formatting help groups them: inline styles, code and secrets, blocks, inserts. */
const groups: Command[][] = [
  [
    { name: "Bold", icon: Bold, key: "b", run: wrap("**", "bold text") },
    { name: "Italic", icon: Italic, key: "i", run: wrap("*", "italic text") },
    {
      name: "Underline",
      icon: Underline,
      key: "u",
      run: wrap("__", "underlined text"),
    },
    {
      name: "Strikethrough",
      icon: Strikethrough,
      run: wrap("~~", "struck text"),
    },
    { name: "Link", icon: Link, key: "k", run: link },
  ],
  [
    { name: "Inline code", icon: Code, run: wrap("`", "code") },
    { name: "Code block", icon: SquareCode, run: codeBlock },
    { name: "Spoiler", icon: EyeOff, run: wrap("||", "spoiler") },
  ],
  [
    { name: "Quote", icon: TextQuote, run: prefix("> ") },
    { name: "List", icon: List, run: prefix("- ") },
    { name: "Heading", icon: Heading, run: prefix("# ") },
  ],
  [
    { name: "Mention", icon: AtSign, panel: "mention" },
    { name: "Timestamp", icon: Clock, panel: "timestamp" },
  ],
];
const commands = groups.flat();

type Props = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onChange" | "value"
> & {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Names the toolbar, such as "Description". */
  label: string;
};

/**
 * A plain textarea that stays Discord markdown, with a toolbar that opens
 * beneath it while it is in use. Commands are applied as native insertions,
 * so Ctrl/⌘+Z undoes them like typing.
 */
export function FormatEditor({
  id,
  value,
  onChange,
  label,
  ...textarea
}: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [current, setCurrent] = useState(0);
  const [described, setDescribed] = useState<Command | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const saved = useRef({ start: 0, end: 0 });
  const pending = useRef<{ start: number; end: number } | null>(null);
  const modifier = isApplePlatform() ? "⌘" : "Ctrl";

  // Where insertText isn't available, the edit goes through React and the selection follows the render.
  useLayoutEffect(() => {
    const selection = pending.current;
    if (!selection || !area.current) return;
    pending.current = null;
    area.current.setSelectionRange(selection.start, selection.end);
  }, [value]);

  const apply = (edit: Edit) => {
    const element = area.current!;
    element.focus();
    element.setSelectionRange(edit.from, edit.to);
    const inserted =
      typeof document.execCommand === "function" &&
      document.execCommand("insertText", false, edit.insert);
    if (inserted && element.value === applyEdit(value, edit)) {
      element.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    } else {
      pending.current = { start: edit.selectionStart, end: edit.selectionEnd };
      onChange(applyEdit(value, edit));
    }
  };

  const press = (command: Command) => {
    const element = area.current!;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (command.panel) {
      saved.current = { start, end };
      setPanel(panel === command.panel ? null : command.panel);
      return;
    }
    apply(command.run!(element.value, start, end));
  };

  const flash = (command: Command) => {
    const button = buttons.current[commands.indexOf(command)];
    if (!button) return;
    button.dataset.pressed = "";
    setTimeout(() => delete button.dataset.pressed, 160);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey)
      return;
    const command = commands.find((c) => c.key === event.key.toLowerCase());
    if (!command) return;
    event.preventDefault();
    flash(command);
    press(command);
  };

  // One tab stop for the whole toolbar; arrow keys move along it.
  const onToolbarKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const focused = buttons.current.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const from = focused === -1 ? current : focused;
    const moves: Record<string, number> = {
      ArrowRight: from + 1,
      ArrowLeft: from - 1,
      Home: 0,
      End: commands.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (moves[event.key]! + commands.length) % commands.length;
    setCurrent(next);
    buttons.current[next]?.focus();
  };

  const closePanel = (snippet?: string) => {
    setPanel(null);
    const { start, end } = saved.current;
    if (snippet) apply(insertSnippet(start, end, snippet));
    else {
      area.current?.focus();
      area.current?.setSelectionRange(start, end);
    }
  };

  const toolbarId = useId();
  return (
    <div className={styles.editor}>
      <textarea
        {...textarea}
        ref={area}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        aria-keyshortcuts="Control+B Control+I Control+U Control+K Meta+B Meta+I Meta+U Meta+K"
      />
      <div className={styles.tray}>
        <div className={styles.trayInner}>
          <div
            role="toolbar"
            aria-label={`Format ${label}`}
            aria-controls={id}
            id={toolbarId}
            className={styles.toolbar}
            onKeyDown={onToolbarKey}
            onPointerLeave={() => setDescribed(null)}
          >
            {groups.map((group, g) => (
              <div key={g} className={styles.group}>
                {group.map((command) => {
                  const index = commands.indexOf(command);
                  return (
                    <button
                      key={command.name}
                      ref={(element) => {
                        buttons.current[index] = element;
                      }}
                      type="button"
                      className={styles.tool}
                      tabIndex={index === current ? 0 : -1}
                      aria-label={command.name}
                      aria-keyshortcuts={
                        command.key
                          ? `Control+${command.key.toUpperCase()} Meta+${command.key.toUpperCase()}`
                          : undefined
                      }
                      aria-expanded={
                        command.panel ? panel === command.panel : undefined
                      }
                      data-active={
                        command.panel && panel === command.panel
                          ? ""
                          : undefined
                      }
                      // Keeps focus, and so the selection, in the textarea when clicked.
                      onPointerDown={(event) => event.preventDefault()}
                      onPointerEnter={() => setDescribed(command)}
                      onFocus={() => {
                        setCurrent(index);
                        setDescribed(command);
                      }}
                      onClick={(event) => {
                        press(command);
                        // From the keyboard, stay on the toolbar for the next command;
                        // the inserts move into their own small form instead.
                        if (event.detail === 0 && !command.panel)
                          buttons.current[index]?.focus();
                      }}
                    >
                      <command.icon aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            ))}
            {/* In the toolbar's own row, so when the tools wrap it shares their last line. */}
            <p className={styles.readout} aria-hidden="true">
              {described ? (
                <>
                  <span>{described.name}</span>
                  {described.key && (
                    <kbd>
                      {modifier} {described.key.toUpperCase()}
                    </kbd>
                  )}
                </>
              ) : (
                <span>Select text, then pick a format</span>
              )}
            </p>
          </div>

          {panel === "mention" && <MentionPanel onDone={closePanel} />}
          {panel === "timestamp" && <TimestampPanel onDone={closePanel} />}
        </div>
      </div>
      <p className={styles.touchHint}>
        Formatting tools open below while you type.
      </p>
    </div>
  );
}

/** An opened form scrolls fully into view, clear of the phone's bottom bar. */
function useRevealed() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest" });
  }, []);
  return ref;
}

interface PanelProps {
  onDone: (snippet?: string) => void;
}

/** Enter inserts and Escape cancels, as in a small form; the composer form itself never submits. */
function panelKeys(
  event: KeyboardEvent,
  insert: () => void,
  cancel: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    cancel();
  } else if (
    event.key === "Enter" &&
    !(event.target instanceof HTMLButtonElement)
  ) {
    event.preventDefault();
    insert();
  }
}

function MentionPanel({ onDone }: PanelProps) {
  const [kind, setKind] = useState<MentionKind>("user");
  const [id, setId] = useState("");
  const [error, setError] = useState(false);
  const field = useId();
  const revealed = useRevealed();
  const insert = () => {
    const value = id.trim();
    if (!isSnowflake(value)) return setError(true);
    onDone(mention(kind, value));
  };
  return (
    <div
      ref={revealed}
      className={styles.panel}
      role="group"
      aria-label="Insert a mention"
      onKeyDown={(event) => panelKeys(event, insert, () => onDone())}
    >
      <fieldset className={styles.kinds}>
        <legend>Mention a</legend>
        {(["user", "role", "channel"] as const).map((value) => (
          <label key={value} className={choice.row}>
            <input
              className={choice.input}
              type="radio"
              name={`${field}-kind`}
              checked={kind === value}
              onChange={() => setKind(value)}
            />
            <span className={choice.mark} aria-hidden="true" />
            {value === "user"
              ? "Member"
              : value === "role"
                ? "Role"
                : "Channel"}
          </label>
        ))}
      </fieldset>
      <div className={styles.panelField}>
        <label htmlFor={`${field}-id`}>ID</label>
        <input
          id={`${field}-id`}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={id}
          aria-invalid={error || undefined}
          aria-describedby={`${field}-help`}
          onChange={(event) => {
            setId(event.target.value);
            setError(false);
          }}
          placeholder="e.g. 110349001187655271"
        />
        <p
          id={`${field}-help`}
          className={error ? styles.panelError : styles.panelHelp}
        >
          {error
            ? "Discord IDs are 17 to 20 digits."
            : "In Discord, turn on Developer Mode, then right-click and Copy ID."}
        </p>
      </div>
      <PanelActions onInsert={insert} onCancel={() => onDone()} />
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
/** The value a datetime-local input expects, in the operator's own time zone. */
export const localInputValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

function TimestampPanel({ onDone }: PanelProps) {
  const [when, setWhen] = useState(() => localInputValue(new Date()));
  const [style, setStyle] = useState<TimestampStyle>("f");
  const [opened] = useState(() => Date.now());
  const field = useId();
  const revealed = useRevealed();
  const date = new Date(when);
  const valid = !Number.isNaN(date.getTime());
  const insert = () => valid && onDone(timestamp(date, style));
  return (
    <div
      ref={revealed}
      className={styles.panel}
      role="group"
      aria-label="Insert a timestamp"
      onKeyDown={(event) => panelKeys(event, insert, () => onDone())}
    >
      <div className={styles.panelField}>
        <label htmlFor={`${field}-when`}>Date and time</label>
        <input
          id={`${field}-when`}
          type="datetime-local"
          autoFocus
          value={when}
          onChange={(event) => setWhen(event.target.value)}
        />
      </div>
      <div className={styles.panelField}>
        <label htmlFor={`${field}-style`}>Shown as</label>
        <select
          id={`${field}-style`}
          value={style}
          onChange={(event) => setStyle(event.target.value as TimestampStyle)}
        >
          {(Object.keys(timestampStyles) as TimestampStyle[]).map((key) => (
            <option key={key} value={key}>
              {timestampStyles[key]}
              {valid
                ? ` · ${formatTimestamp(date, key, new Date(opened))}`
                : ""}
            </option>
          ))}
        </select>
        <p className={styles.panelHelp}>
          Each reader sees it in their own time zone.
        </p>
      </div>
      <PanelActions
        onInsert={insert}
        onCancel={() => onDone()}
        disabled={!valid}
      />
    </div>
  );
}

function PanelActions({
  onInsert,
  onCancel,
  disabled,
}: {
  onInsert: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.panelActions}>
      <button
        type="button"
        className={styles.insert}
        onClick={onInsert}
        disabled={disabled}
      >
        Insert
      </button>
      <button type="button" className={styles.cancel} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
