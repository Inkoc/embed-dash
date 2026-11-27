# Preview fidelity

What the live preview renders for each part of a message, why we believe Discord renders it the same way, and where the two knowingly differ. The fixtures below run as unit tests (`apps/web/src/preview/fidelity.fixtures.ts`, `fidelity.test.tsx`), so this table and the code can't drift apart without a failing test.

## What it was checked against

| Source | Version / date | What it settles |
|---|---|---|
| Discord developer docs, [message formatting reference](https://docs.discord.com/developers/reference#message-formatting) | read 27 November 2026 | Mention, custom emoji and timestamp syntax; the seven timestamp styles |
| Discord support, [Markdown Text 101](https://support.discord.com/hc/en-us/articles/210298617-Markdown-Text-101-Chat-Formatting-Bold-Italic-Underline) | read 27 November 2026 | The markdown grammar in message text |
| [Carl-bot embed documentation](https://github.com/botlabs-gg/carlbot-docs/blob/master/docs/embeds.md) | read 27 November 2026 | Community observations of which embed parts ignore formatting |
| Discord desktop client | **not yet checked** | No Discord client could be run where this was built. The first person to compare the fixtures against a real client should record the build here (Settings, bottom of the left column, e.g. "Stable 412345") and correct any row marked *observed* or *assumed* that disagrees. |

Discord publishes the grammar for messages but no per-field matrix for embeds, so every row says where its expectation comes from:

- **documented**: stated in Discord's own docs above.
- **observed**: widely reported by bot makers (and consistent with how Discord's clients have behaved for years), but not stated by Discord.
- **assumed**: our best reading, to be confirmed against a client.

## Which parts get which formatting

| Part | Formatting | Evidence |
|---|---|---|
| Message text | Full grammar (below), including masked links | documented |
| Embed description, field values | Full grammar, including masked links, headings, lists and subtext | observed |
| Embed title, field names | Bold, italic, underline, strikethrough, inline code, spoilers, custom emoji, timestamps. Links, mentions, headings, quotes, lists and code blocks show as typed | observed (styles, links, mentions); assumed (timestamps, spoilers) |
| Author name, footer text | No formatting at all; shown exactly as typed | observed |

## Fixtures

Expected output is the markup the preview renders, without class names. `ID` stands for the 18-digit test ID `123456789012345678`.

### Message text, description and field values (`rich`)

| Fixture | Input | Renders as | Evidence |
|---|---|---|---|
| rich-bold | `**bold**` | bold | documented |
| rich-italic | `*one* _two_` | both italic | documented |
| rich-underline | `__under__` | underlined | documented |
| rich-strike | `~~gone~~` | struck through | documented |
| rich-nested | `***__all three__***` | bold, italic and underlined | documented |
| rich-inline-code | ``run `npm *i*` now`` | code span; the asterisks inside stay literal | documented |
| rich-code-block | `Before` / ` ```js ` / `const a = 1;` / ` ``` ` / `After` | code block on its own lines, no blank line before "After" | documented (block); observed (spacing) |
| rich-quote | `> quoted` / `not quoted` | one quoted line, then plain text | documented |
| rich-quote-rest | `>>> every` / `line after` | everything after `>>>` quoted | documented |
| rich-quote-mid-line | `a > b` | plain text | documented |
| rich-masked-link | `[patch notes](https://example.com/notes)` | link labelled "patch notes" | documented |
| rich-bare-link | `see https://example.com` | the address as a link | documented |
| rich-unsafe-link | `[x](javascript:alert(1))` | shown as typed, not a link | observed (Discord only links web addresses) |
| rich-headings | `# One` … `#### Four` | three heading sizes; `####` stays as typed | documented |
| rich-heading-mid-line | `a # b` | plain text | documented |
| rich-subtext | `-# small **print**` | small muted line, still formatted | documented |
| rich-list | `- one` / `  - nested` / `- two` / `1. first` / `after` | bulleted list with a nested list, then a numbered list, then text | documented (lists, nesting); assumed (bullets then numbers splitting into two lists) |
| rich-list-start | `3. three` / `4. four` | numbered list starting at 3 | documented |
| rich-list-mid-line | `a - b` | plain text | documented |
| rich-spoiler | `\|\|the **end**\|\|` | hidden until clicked, then formatted | documented |
| rich-mentions | `<@ID> <@!ID> <@&ID> <#ID> @everyone @here` | mention chips: "@unknown-user" twice, "@deleted-role", "#unknown", "@everyone", "@here" | documented (syntax); assumed (labels, see below) |
| rich-short-id | `<@123>` | shown as typed (IDs are 17 to 20 digits) | documented |
| rich-emoji | `<:wave:ID> <a:dance:ID>` | Discord's CDN images, the animated one requested animated | documented |
| rich-unicode-emoji | `ship it 🚀 :rocket:` | the emoji character; `:rocket:` stays as typed | observed (bots' shortcodes aren't converted) |
| rich-escape | `\*not italic\*` | literal asterisks | documented |
| rich-command | `</help:ID>` | shown as typed | not covered, see differences |
| rich-line-breaks | `one` / (blank) / `two` | blank line kept | documented |

### Embed title and field names (`inline`)

| Fixture | Input | Renders as | Evidence |
|---|---|---|---|
| inline-styles | ``**b** *i* __u__ ~~s~~ `c` \|\|sp\|\|`` | each style, spoiler hidden | observed; assumed (spoiler) |
| inline-link | `[docs](https://example.com) https://example.com` | shown as typed | observed |
| inline-mention | `<@ID> <#ID>` | shown as typed | observed |
| inline-blocks | `# Not a heading` / `> not a quote` / `- not a list` | shown as typed, line by line | observed |
| inline-emoji | `<:wave:ID>` | the emoji image | observed |

### Author name and footer text (`plain`)

| Fixture | Input | Renders as | Evidence |
|---|---|---|---|
| plain-everything | `**b** <@ID> [a](https://example.com) <t:1700000000:R> <:wave:ID>` | exactly as typed | observed |

### Timestamps

`<t:seconds:style>` is shown in the reader's own language and time zone, so the preview uses the operator's browser settings. With no style, Discord uses `f`. A value too large to be a date stays as typed. Hovering shows the long form, as in Discord.

| Style | en-US example (tested) | Evidence |
|---|---|---|
| `t` | 10:13 PM | documented |
| `T` | 10:13:20 PM | documented |
| `d` | 11/14/2023 (de-DE: 14.11.2023) | documented |
| `D` | November 14, 2023 | documented |
| `f` (default) | November 14, 2023 at 10:13 PM | documented (style); assumed ("at", which recent clients show) |
| `F` | Tuesday, November 14, 2023 at 10:13 PM | documented (style); assumed ("at") |
| `R` | 3 hours ago, in 2 days, 2 months ago | documented (style); assumed (exact wording, from the browser's relative-time formatter) |

## Layout

| Behaviour | Evidence |
|---|---|
| Up to three inline fields share a row; two when a thumbnail takes the right edge; each row's fields split the width evenly | observed |
| A field that isn't inline takes the full row and ends the run of inline fields before it | observed |
| Colour bar on the left; thumbnail top right beside the text; image below the fields; footer last, with its icon and the time after a bullet | observed |
| All ten embeds a message can carry are shown, in order | documented (limit) |
| A picture whose link doesn't load is replaced by a grey placeholder of the same size; a broken author or footer icon becomes an empty grey circle | observed (Discord's broken-image box); assumed (icons) |
| Dark and light follow the app theme, in Discord's dark and light chat colours | documented in `DESIGN.md` |

## Known differences

Deliberate, or not covered yet:

- **Font.** Noto Sans stands in for Discord's own typeface, so line breaks can fall in slightly different places. Code uses the system's monospace font.
- **Links are always underlined.** Discord underlines only on hover. The link colour alone isn't distinct enough from body text to be the only cue, and accessibility comes first.
- **Light-theme mention ink** is a little darker than Discord's so it passes AA contrast on the embed, like the light link colour.
- **Mention names.** With no server context, user, role and channel mentions show Discord's fallback labels ("@unknown-user", "@deleted-role", "#unknown"). The ID is in the chip's tooltip. Readers in the server see the real names.
- **Code blocks** aren't syntax-highlighted.
- **Unicode emoji** use the system emoji font, not Discord's emoji images, and are not enlarged when a message is only emoji.
- **Slash-command and server-navigation links** (`</name:id>`, `<id:customize>`) show as typed; they need a server to resolve.
- **Relative timestamps** are worked out when the preview renders and don't tick while it is open.
