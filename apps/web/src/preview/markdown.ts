import { rules, rulesExtended, SimpleMarkdown } from "discord-markdown-parser";

/** A node of the parsed text, as discord-markdown-parser and the list rule below produce it. */
export interface MarkdownNode {
  type: string;
  [key: string]: unknown;
}

/**
 * Where text sits decides how much Discord formats it:
 * - `rich`: message text, embed description and field values get the full grammar.
 * - `inline`: embed title and field names get inline styles, emoji and
 *   timestamps; links, mentions and block syntax stay as typed.
 * - `plain`: author name and footer text are shown exactly as typed.
 */
export type Surface = "rich" | "inline" | "plain";

const listLine = /^( *)([-*]|\d{1,9}\.) +(\S[^\n]*)/;
const listBlock =
  /^ *(?:[-*]|\d{1,9}\.) +\S[^\n]*(?:\n *(?:[-*]|\d{1,9}\.) +\S[^\n]*)*\n?/;

/**
 * Discord's bulleted (`-` or `*`) and numbered (`1.`) lists, which the parser
 * package lacks. A list starts at the beginning of a line and runs while
 * lines keep a marker. A deeper indent nests under the item above, and
 * switching between bullets and numbers starts a new list.
 */
const list = {
  order: SimpleMarkdown.defaultRules.heading.order - 0.4,
  match: (source: string, _state: unknown, previous: string) =>
    previous === "" || previous.endsWith("\n") ? listBlock.exec(source) : null,
  parse: (
    capture: string[],
    parse: (source: string, state: object) => MarkdownNode[],
    state: object,
  ) => {
    const lines = capture[0]!
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => {
        const [, spaces = "", marker = "", text = ""] = listLine.exec(line)!;
        return { indent: spaces.length, marker, text };
      });
    const level = (from: number, indent: number): [MarkdownNode[], number] => {
      const lists: MarkdownNode[] = [];
      let i = from;
      while (i < lines.length && lines[i]!.indent >= indent) {
        const line = lines[i]!;
        const ordered = /\d/.test(line.marker);
        let current = lists.at(-1);
        if (current?.ordered !== ordered) {
          current = {
            type: "list",
            ordered,
            start: ordered ? Number.parseInt(line.marker, 10) : undefined,
            items: [],
          };
          lists.push(current);
        }
        const item = parse(line.text, { ...state, inline: true });
        i++;
        if (i < lines.length && lines[i]!.indent > line.indent) {
          const [nested, next] = level(i, lines[i]!.indent);
          item.push(...nested);
          i = next;
        }
        (current.items as MarkdownNode[][]).push(item);
      }
      return [lists, i];
    };
    return level(0, 0)[0];
  },
};

const inlineRuleNames = [
  "escape",
  "em",
  "strong",
  "underline",
  "strikethrough",
  "inlineCode",
  "spoiler",
  "emoji",
  "twemoji",
  "timestamp",
  "emoticon",
  "br",
  "text",
] as const;

// Discord's slash-command and server-navigation links need a server to mean
// anything, so they are left out and show as typed.
const richRules = Object.fromEntries(
  Object.entries(rulesExtended).filter(
    ([name]) => name !== "slashCommand" && name !== "guildNavigation",
  ),
);

const parsers = {
  rich: SimpleMarkdown.parserFor({ ...richRules, list }),
  inline: SimpleMarkdown.parserFor(
    Object.fromEntries(inlineRuleNames.map((name) => [name, rules[name]!])),
  ),
};

export function parseMarkdown(text: string, surface: Surface): MarkdownNode[] {
  if (surface === "plain") return [{ type: "text", content: text }];
  return parsers[surface](text, { inline: true }) as MarkdownNode[];
}
