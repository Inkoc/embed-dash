import type { Surface } from "./markdown";

/**
 * The preview fidelity fixtures: what each part of a message should look like
 * for a given input, written as the markup the preview renders (class names
 * left out). docs/preview-fidelity.md lists the same set with the evidence
 * behind each expectation.
 */
export interface Fixture {
  id: string;
  surface: Surface;
  input: string;
  html: string;
}

const id = "123456789012345678";
const link = (href: string, text = href) =>
  `<a href="${href}" title="${href}" target="_blank" rel="noreferrer">${text}</a>`;
const spoiler = (inner: string) =>
  `<button type="button" aria-label="Spoiler, select to show"><span aria-hidden="true" inert="">${inner}</span></button>`;
const mention = (label: string, kind: string) =>
  `<span title="${kind} ID ${id}">${label}</span>`;

export const fixtures: Fixture[] = [
  // Message text, embed description and field values: the full grammar.
  {
    id: "rich-bold",
    surface: "rich",
    input: "**bold**",
    html: "<strong>bold</strong>",
  },
  {
    id: "rich-italic",
    surface: "rich",
    input: "*one* _two_",
    html: "<em>one</em> <em>two</em>",
  },
  {
    id: "rich-underline",
    surface: "rich",
    input: "__under__",
    html: "<u>under</u>",
  },
  {
    id: "rich-strike",
    surface: "rich",
    input: "~~gone~~",
    html: "<s>gone</s>",
  },
  {
    id: "rich-nested",
    surface: "rich",
    input: "***__all three__***",
    html: "<em><strong><u>all three</u></strong></em>",
  },
  {
    id: "rich-inline-code",
    surface: "rich",
    input: "run `npm *i*` now",
    html: "run <code>npm *i*</code> now",
  },
  {
    id: "rich-code-block",
    surface: "rich",
    input: "Before\n```js\nconst a = 1;\n```\nAfter",
    html: "Before<br/><pre><code>const a = 1;</code></pre>After",
  },
  {
    id: "rich-quote",
    surface: "rich",
    input: "> quoted\nnot quoted",
    html: "<blockquote>quoted</blockquote>not quoted",
  },
  {
    id: "rich-quote-rest",
    surface: "rich",
    input: ">>> every\nline after",
    html: "<blockquote>every<br/>line after</blockquote>",
  },
  {
    id: "rich-quote-mid-line",
    surface: "rich",
    input: "a > b",
    html: "a &gt; b",
  },
  {
    id: "rich-masked-link",
    surface: "rich",
    input: "[patch notes](https://example.com/notes)",
    html: link("https://example.com/notes", "patch notes"),
  },
  {
    id: "rich-link-label-is-url",
    surface: "rich",
    input:
      "[https://example.com](https://example.org/real) [**see https://a.example**](https://example.org/b)",
    html: `${link("https://example.org/real", "https://example.com")} ${link("https://example.org/b", "<strong>see https://a.example</strong>")}`,
  },
  {
    id: "rich-bare-link",
    surface: "rich",
    input: "see https://example.com",
    html: `see ${link("https://example.com")}`,
  },
  {
    id: "rich-unsafe-link",
    surface: "rich",
    input: "[x](javascript:alert(1))",
    html: "[x](javascript:alert(1))",
  },
  {
    id: "rich-headings",
    surface: "rich",
    input: "# One\n## Two\n### Three\n#### Four",
    html: '<p data-level="1">One</p><p data-level="2">Two</p><p data-level="3">Three</p>#### Four',
  },
  {
    id: "rich-heading-mid-line",
    surface: "rich",
    input: "a # b",
    html: "a # b",
  },
  {
    id: "rich-subtext",
    surface: "rich",
    input: "-# small **print**",
    html: "<small>small <strong>print</strong></small>",
  },
  {
    id: "rich-list",
    surface: "rich",
    input: "- one\n  - nested\n- two\n1. first\nafter",
    html: '<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul><ol start="1"><li>first</li></ol>after',
  },
  {
    id: "rich-list-start",
    surface: "rich",
    input: "3. three\n4. four",
    html: '<ol start="3"><li>three</li><li>four</li></ol>',
  },
  {
    id: "rich-list-mid-line",
    surface: "rich",
    input: "a - b",
    html: "a - b",
  },
  {
    id: "rich-spoiler",
    surface: "rich",
    input: "||the **end**||",
    html: spoiler("the <strong>end</strong>"),
  },
  {
    id: "rich-mentions",
    surface: "rich",
    input: `<@${id}> <@!${id}> <@&${id}> <#${id}> @everyone @here`,
    html: [
      mention("@unknown-user", "User"),
      mention("@unknown-user", "User"),
      mention("@deleted-role", "Role"),
      mention("#unknown", "Channel"),
      "<span>@everyone</span>",
      "<span>@here</span>",
    ].join(" "),
  },
  {
    id: "rich-short-id",
    surface: "rich",
    input: "<@123>",
    html: "&lt;@123&gt;",
  },
  {
    id: "rich-emoji",
    surface: "rich",
    input: `<:wave:${id}> <a:dance:${id}>`,
    html: `<img src="https://cdn.discordapp.com/emojis/${id}.webp?size=48" alt=":wave:" title=":wave:" width="22" height="22" draggable="false"/> <img src="https://cdn.discordapp.com/emojis/${id}.webp?size=48&amp;animated=true" alt=":dance:" title=":dance:" width="22" height="22" draggable="false"/>`,
  },
  {
    id: "rich-unicode-emoji",
    surface: "rich",
    input: "ship it 🚀 :rocket:",
    html: "ship it 🚀 :rocket:",
  },
  {
    id: "rich-escape",
    surface: "rich",
    input: "\\*not italic\\*",
    html: "*not italic*",
  },
  {
    id: "rich-command",
    surface: "rich",
    input: `</help:${id}>`,
    html: `&lt;/help:${id}&gt;`,
  },
  {
    id: "rich-line-breaks",
    surface: "rich",
    input: "one\n\ntwo",
    html: "one<br/><br/>two",
  },

  // Embed title and field names: inline styles, emoji and timestamps only.
  {
    id: "inline-styles",
    surface: "inline",
    input: "**b** *i* __u__ ~~s~~ `c` ||sp||",
    html: `<strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <code>c</code> ${spoiler("sp")}`,
  },
  {
    id: "inline-link",
    surface: "inline",
    input: "[docs](https://example.com) https://example.com",
    html: "[docs](https://example.com) https://example.com",
  },
  {
    id: "inline-mention",
    surface: "inline",
    input: `<@${id}> <#${id}>`,
    html: `&lt;@${id}&gt; &lt;#${id}&gt;`,
  },
  {
    id: "inline-blocks",
    surface: "inline",
    input: "# Not a heading\n> not a quote\n- not a list",
    html: "# Not a heading<br/>&gt; not a quote<br/>- not a list",
  },
  {
    id: "inline-emoji",
    surface: "inline",
    input: `<:wave:${id}>`,
    html: `<img src="https://cdn.discordapp.com/emojis/${id}.webp?size=48" alt=":wave:" title=":wave:" width="22" height="22" draggable="false"/>`,
  },

  // Author name and footer text: exactly as typed.
  {
    id: "plain-everything",
    surface: "plain",
    input: `**b** <@${id}> [a](https://example.com) <t:1700000000:R> <:wave:${id}>`,
    html: `**b** &lt;@${id}&gt; [a](https://example.com) &lt;t:1700000000:R&gt; &lt;:wave:${id}&gt;`,
  },
];
