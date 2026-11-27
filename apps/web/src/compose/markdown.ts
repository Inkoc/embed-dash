/**
 * Formatting commands as plain text edits on Discord markdown: each returns
 * the range to replace, its replacement and the selection afterwards, so the
 * editor can apply it as one native, undoable insertion.
 */
export interface Edit {
  from: number;
  to: number;
  insert: string;
  selectionStart: number;
  selectionEnd: number;
}

export const applyEdit = (text: string, edit: Edit) =>
  text.slice(0, edit.from) + edit.insert + text.slice(edit.to);

const runOf = (text: string, at: number, char: string, step: 1 | -1) => {
  let n = 0;
  while (text[step === 1 ? at + n : at - 1 - n] === char) n++;
  return n;
};

/**
 * A run of marker characters wraps the text when it is the marker itself or,
 * for `*` and `**`, the three stars of bold italic; so italic on `**bold**`
 * adds a star instead of eating one of bold's.
 */
const wraps = (run: number, marker: string) =>
  run === marker.length || (marker[0] === "*" && run === 3);

/** Wraps the selection in a marker such as `**`, or unwraps it when it is already wrapped. */
export function toggleWrap(
  text: string,
  start: number,
  end: number,
  marker: string,
  placeholder: string,
): Edit {
  const m = marker.length;
  const char = marker[0]!;
  const selected = text.slice(start, end);
  const inner = (s: string) => runOf(s, 0, char, 1);
  const innerEnd = (s: string) => runOf(s, s.length, char, -1);
  if (
    selected.length > 2 * m &&
    inner(selected) === innerEnd(selected) &&
    wraps(inner(selected), marker)
  ) {
    const unwrapped = selected.slice(m, -m);
    return {
      from: start,
      to: end,
      insert: unwrapped,
      selectionStart: start,
      selectionEnd: start + unwrapped.length,
    };
  }
  const before = runOf(text, start, char, -1);
  const after = runOf(text, end, char, 1);
  if (before === after && wraps(before, marker) && start >= m) {
    return {
      from: start - m,
      to: end + m,
      insert: selected,
      selectionStart: start - m,
      selectionEnd: end - m,
    };
  }
  const body = selected || placeholder;
  return {
    from: start,
    to: end,
    insert: marker + body + marker,
    selectionStart: start + m,
    selectionEnd: start + m + body.length,
  };
}

const lineStart = (text: string, at: number) =>
  text.lastIndexOf("\n", at - 1) + 1;
const lineEnd = (text: string, at: number) => {
  const next = text.indexOf("\n", at);
  return next === -1 ? text.length : next;
};

/**
 * Puts a prefix such as `> ` in front of every selected line, or takes it off
 * when every line already has it. Headings replace any heading level.
 */
export function toggleLinePrefix(
  text: string,
  start: number,
  end: number,
  prefix: string,
): Edit {
  const from = lineStart(text, start);
  // A selection ending just after a line break doesn't take in the next line.
  const to = lineEnd(
    text,
    end > start && text[end - 1] === "\n" ? end - 1 : end,
  );
  const lines = text.slice(from, to).split("\n");
  const existing = prefix.startsWith("#") ? /^#{1,3} / : null;
  const filled = lines.filter((line) => line.trim());
  const all =
    filled.length > 0 && filled.every((line) => line.startsWith(prefix));
  const insert = lines
    .map((line) => {
      if (all)
        return line.startsWith(prefix) ? line.slice(prefix.length) : line;
      if (!line.trim() && lines.length > 1) return line;
      return prefix + (existing ? line.replace(existing, "") : line);
    })
    .join("\n");
  return {
    from,
    to,
    insert,
    selectionStart: start === end ? from + insert.length : from,
    selectionEnd: from + insert.length,
  };
}

const fenced = /^```[^\n`]*\n([\s\S]*?)\n?```$/;

/**
 * Fences the selection, or an empty block, on lines of its own; a selection
 * that is already fenced, or sits just inside fences, is unfenced instead.
 */
export function codeBlock(text: string, start: number, end: number): Edit {
  const whole = fenced.exec(text.slice(start, end));
  if (whole) {
    const body = whole[1]!;
    return {
      from: start,
      to: end,
      insert: body,
      selectionStart: start,
      selectionEnd: start + body.length,
    };
  }
  const prior = text.slice(0, start);
  const opening = /```[^\n`]*\n$/.exec(prior);
  // An odd count of fences before the selection means the last one opens a block.
  const inside = opening && prior.split("```").length % 2 === 0;
  if (inside && text.startsWith("\n```", end)) {
    const body = text.slice(start, end);
    return {
      from: opening.index,
      to: end + 4,
      insert: body,
      selectionStart: opening.index,
      selectionEnd: opening.index + body.length,
    };
  }
  const before = start > 0 && text[start - 1] !== "\n" ? "\n" : "";
  const after = end < text.length && text[end] !== "\n" ? "\n" : "";
  const body = text.slice(start, end);
  const insert = `${before}\`\`\`\n${body}\n\`\`\`${after}`;
  const bodyStart = start + before.length + 4;
  return {
    from: start,
    to: end,
    insert,
    selectionStart: bodyStart,
    selectionEnd: bodyStart + body.length,
  };
}

/**
 * Makes a masked link. A selected web address becomes the target and the
 * label is selected to be typed; otherwise the selection is the label and
 * `https://` is selected, ready for the address to be pasted over it.
 */
export function link(text: string, start: number, end: number): Edit {
  const selected = text.slice(start, end);
  if (/^https?:\/\/\S+$/.test(selected)) {
    const label = "link text";
    return {
      from: start,
      to: end,
      insert: `[${label}](${selected})`,
      selectionStart: start + 1,
      selectionEnd: start + 1 + label.length,
    };
  }
  const label = selected || "link text";
  const urlStart = start + label.length + 3;
  return {
    from: start,
    to: end,
    insert: `[${label}](https://)`,
    selectionStart: urlStart,
    selectionEnd: urlStart + "https://".length,
  };
}

/** Replaces the selection with a snippet such as a mention and puts the caret after it. */
export function insertSnippet(
  start: number,
  end: number,
  snippet: string,
): Edit {
  return {
    from: start,
    to: end,
    insert: snippet,
    selectionStart: start + snippet.length,
    selectionEnd: start + snippet.length,
  };
}

export type MentionKind = "user" | "role" | "channel";
export const mention = (kind: MentionKind, id: string) =>
  ({ user: `<@${id}>`, role: `<@&${id}>`, channel: `<#${id}>` })[kind];

/** Discord's timestamp styles, each shown to the reader in their own time zone and language. */
export const timestampStyles = {
  R: "Relative",
  t: "Short time",
  T: "Long time",
  d: "Short date",
  D: "Long date",
  f: "Short date and time",
  F: "Long date and time",
} as const;
export type TimestampStyle = keyof typeof timestampStyles;
export const timestamp = (date: Date, style: TimestampStyle) =>
  `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;

/** Discord IDs (snowflakes) are 17 to 20 digits long. */
export const isSnowflake = (id: string) => /^\d{17,20}$/.test(id);
