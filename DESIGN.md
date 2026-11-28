---
name: embed-dash
description: The index desk, a card catalogue run from the keyboard, for composing Discord embeds and filing them into channels.
colors:
  ground-light: "oklch(96.3% 0.006 232)"
  sheet-light: "oklch(99.6% 0.002 232)"
  sheet-2-light: "oklch(97.4% 0.005 232)"
  field-light: "oklch(100% 0 0)"
  ink-light: "oklch(23% 0.028 250)"
  ink-2-light: "oklch(45% 0.022 250)"
  rule-light: "oklch(91.5% 0.009 236)"
  rule-2-light: "oklch(84% 0.013 236)"
  field-line-light: "oklch(60% 0.018 240)"
  accent-light: "oklch(47% 0.085 186)"
  accent-hover-light: "oklch(41% 0.08 186)"
  on-accent-light: "oklch(99% 0.004 185)"
  accent-wash-light: "oklch(95.4% 0.028 185)"
  ring-light: "oklch(52% 0.1 186)"
  danger-light: "oklch(50% 0.175 27)"
  warn-light: "oklch(50% 0.11 62)"
  tray-light: "oklch(25% 0.035 248)"
  tray-accent-light: "oklch(81% 0.11 181)"
  ground-dark: "oklch(17% 0.016 250)"
  sheet-dark: "oklch(20.8% 0.018 250)"
  sheet-2-dark: "oklch(23.6% 0.02 250)"
  field-dark: "oklch(17.8% 0.016 250)"
  ink-dark: "oklch(94.5% 0.007 232)"
  ink-2-dark: "oklch(75% 0.016 238)"
  rule-dark: "oklch(28.5% 0.018 250)"
  rule-2-dark: "oklch(35% 0.02 250)"
  field-line-dark: "oklch(57% 0.02 245)"
  accent-dark: "oklch(78% 0.115 182)"
  accent-hover-dark: "oklch(85% 0.1 182)"
  on-accent-dark: "oklch(20% 0.035 222)"
  accent-wash-dark: "oklch(27.5% 0.042 196)"
  ring-dark: "oklch(78% 0.115 182)"
  danger-dark: "oklch(75% 0.14 25)"
  warn-dark: "oklch(82% 0.12 78)"
  tray-dark: "oklch(26% 0.032 246)"
  tray-accent-dark: "oklch(80% 0.115 181)"
  brand-teal: "#0d9488"
typography:
  display:
    fontFamily: "Atkinson Next, Segoe UI, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  count:
    fontFamily: "Atkinson Mono, ui-monospace, monospace"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 0.9
    fontFeature: "tnum"
  title:
    fontFamily: "Atkinson Next, Segoe UI, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 750
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Atkinson Next, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Atkinson Next, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 650
  meta:
    fontFamily: "Atkinson Next, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
  data:
    fontFamily: "Atkinson Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    fontFeature: "tnum"
  key:
    fontFamily: "Atkinson Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
  preview:
    fontFamily: "Preview Sans, Noto Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.375rem"
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
  "7": "3rem"
components:
  button-primary:
    backgroundColor: "{colors.accent-light}"
    textColor: "{colors.on-accent-light}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 1.5rem"
    height: "3rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover-light}"
  button-quiet:
    textColor: "{colors.accent-light}"
    rounded: "{rounded.sm}"
    padding: "0 0.75rem"
    height: "2.75rem"
  input:
    backgroundColor: "{colors.field-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
    height: "2.75rem"
  sheet:
    backgroundColor: "{colors.sheet-light}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  segmented-track:
    backgroundColor: "{colors.ground-light}"
    rounded: "{rounded.lg}"
    padding: "0.1875rem"
  segmented-thumb:
    backgroundColor: "{colors.sheet-light}"
    rounded: "{rounded.md}"
  key-cap:
    backgroundColor: "{colors.sheet-light}"
    textColor: "{colors.ink-2-light}"
    typography: "{typography.key}"
    rounded: "{rounded.xs}"
  tray:
    backgroundColor: "{colors.tray-light}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
---

# Design System: embed-dash

## Overview

**Creative North Star: "The Index Desk"**

embed-dash is a library card catalogue run from the keyboard. The composer is one index sheet on a desk: the parts every embed needs lie open, the optional ones are filed as one-line summaries, and the live Discord preview sits beside the sheet like the card being checked against the original. Sending is filing: every channel the bot can reach is an index entry, filed in a drawer per server, its ID read like a call number; ticked entries are filed into a deep-ink tray that holds the selection, the send button and each channel's result. The app speaks in measurements (counts, budgets, widths, IDs), and those are the only things set in monospace.

Density is that of a working tool, not a dashboard: one sheet, ruled lists that run to the sheet's edges, no cards inside cards. Character lives in a handful of crafted objects (call numbers, drawer label holders, the tray, printed key caps, the budget ruler) rather than in decoration. There are no gradients except the ruler's ticks, no glass, no glow. The preview is the only place that looks like Discord, and it must look exactly like Discord; nothing outside it borrows Discord's chrome.

Both themes are designed, not inverted. Light is cool card stock with near-white sheets; dark is a blue-black desk with sheets one step lighter. The tray is deep ink in both, one step above the dark sheets so it still reads as the darkest, densest object on a dark desk.

**Key Characteristics:**

- One accent, teal, used for selection, the primary path, focus and "done"; red only for errors, amber only near a limit.
- Atkinson Hyperlegible Next for everything a person reads, its Mono only for data: counts, IDs, widths, key caps.
- Ruled lists and one sheet per view; depth in three layers (desk, sheet, tray), each with a soft offset shadow and a hairline.
- Every keyboard shortcut is printed as a key cap beside the control it drives, and the cap presses when the shortcut is used.
- Motion is exponential ease-out, has a job, and never holds input.

### Signature elements that must survive

These are the direction. If later work drops them, the app becomes a generic admin form.

1. **The index sheet.** One sheet per composer, sections divided by rules, optional parts folded into one-line summaries, fields as a numbered ruled list (number, name, value, Inline or Full width). Never a stack of boxed cards.
2. **The budget ruler.** Discord's 6,000-character embed budget shown as a ruler with a tick per 1,000 characters and a fill that turns amber past 90% and red past the limit, with the count in mono.
3. **Quiet counts.** A field's character count appears only while the field has focus, or permanently once its text passes 90% of the limit (amber), and turns red over the limit. Counts never clutter idle fields.
4. **Printed key caps.** Shortcuts are shown as key caps beside their controls (Ctrl/⌘ ↵ on the forward action, Esc on the way back, ? on Shortcuts). A cap visibly presses when its shortcut fires.
5. **The sliding thumb.** Segmented controls (views, Edit/Preview, width presets) have one thumb that slides to the active item.
6. **The faithful preview.** A Discord message in Discord's own colours and metrics, switching between Discord's dark and light chat with the app theme and labelled "Discord dark" or "Discord light". Resizable by a ruled handle, with Desktop and Phone width presets and a mono width readout.
7. **Call numbers** (Send). Snowflake IDs in mono with the shared prefix in secondary ink and the last six digits bold, so the part that tells two `#news` channels apart is read first.
8. **Drawer label holders** (Send). A server without an icon is shown by a framed tag carrying its initials, with a rivet either side, like the brass holder on a catalogue drawer.
9. **The deep-ink tray** (Send). The selection as slips in a deep-ink panel with a large rolling count; ticked entries fly into it; each slip carries its own send result and retry.
10. **The theme wipe.** A new theme is laid over the old like a fresh card pulled down over the desk.

## Colors

A cool, nearly neutral desk with a single committed teal; status colours appear only when they mean something.

### Primary

- **Index Teal** (`oklch(47% 0.085 186)` light, `oklch(78% 0.115 182)` dark): the primary action, links, the active ruler fill, selected rows, focus. White text on it in light (6.3:1), dark ink on it in dark (9.5:1). The brand mark keeps its own `#0d9488` square.
- **Tray Teal** (`oklch(81% 0.11 181)` / `oklch(80% 0.115 181)`): the brighter teal used only on the deep-ink tray (Send button, results).

### Neutral

- **Desk** (`--ground`): the page behind everything.
- **Index Sheet** (`--sheet`, `--sheet-2` for headers and hover): the composer sheet, bars, frames.
- **Field** (`--field`): inputs, one step off the sheet.
- **Ink** (`--ink`) and **Secondary Ink** (`--ink-2`): text; secondary ink for labels' companions, meta and IDs' shared prefixes. Never grey on a coloured surface; the tray has its own `--tray-soft`.
- **Rules** (`--rule`, `--rule-2`): hairlines between sections and rows; `--rule-2` for frames and key caps.
- **Field Line** (`--field-line`): input and control borders, at least 3:1 against every surface it sits on.
- **Deep Ink Tray** (`--tray`, `--tray-2`, `--tray-line`, `--tray-ink`, `--tray-soft`): the tray and its slips.

### Status

- **Danger** (`--danger`, `--danger-wash`): errors only, always with an ✗ icon and words.
- **Warn** (`--warn`): "near the limit" only.
- **Access warning** (`--access-warning`): amber ink with a triangle icon on the ruled header notice for open instances. On phones it folds to its first line ("No login required.") with a **Details** toggle for the rest, so it doesn't squeeze the editing area. It stays visible with the header; composer sticky offsets include its measured height.
- **Mark** (`--mark`): search-hit highlight in the catalogue.

### Discord preview (fixed, not themable)

`--dc-*` tokens reproduce Discord's chat: dark `#313338` / embed `#2b2d31`, light `#ffffff` / embed `#f2f3f5`, text, header, muted and link colours, and the blurple "APP" tag. In light the link is darkened to `#0063d3` so it passes AA on the embed, and the mention ink likewise to `#4752c4`. The message markup (code, quotes, headings, subtext, lists, mention and timestamp chips, spoilers) has its own `--dc-*` colours and metrics, and code uses Discord's system monospace stack (`--font-preview-code`); nothing is bundled for it. In a linked title, chips (timestamp, code, revealed spoiler) take the lighter `--dc-link-tint` so link-coloured text keeps AA contrast. Links in the preview are always underlined, not only on hover as in Discord, so colour is never the only cue. `docs/preview-fidelity.md` lists what each part of a message renders and every known difference from Discord.

### Sample content

The example draft ("Start from an example") carries its own side colour (`#e8a33d`). It is user content, like any colour an operator picks, not part of the app palette, so it lives in the draft and not in `tokens.css`. The example has no media links: anything bundled with a self-hosted app is usually out of Discord's reach.

### Named Rules

**The One Accent Rule.** Teal is the only accent. Red and amber are signals, not decoration.
**The Coloured Text Rule.** Text on a coloured surface uses that surface's own ink token (`--on-accent`, `--tray-soft`), never a grey.

All text pairs reach 4.5:1 and all control borders and focus rings 3:1 in both themes (lowest: Discord dark muted text 4.5:1, light input border on the desk 3.5:1).

## Typography

**UI Font:** Atkinson Hyperlegible Next (variable, 200–800)
**Data Font:** Atkinson Hyperlegible Mono (variable, 200–800)
**Preview Font:** Noto Sans (variable, normal and italic), self-hosted under the family name `Preview Sans`; Discord's own first fallback, standing in for its proprietary face

**Character:** a typeface designed for telling similar characters apart, which is the whole job when reading channel names and IDs; its mono sibling sets every measurement in the same voice.

### Hierarchy

- **Display** (800, 1.75rem, 1.1, -0.025em): view titles ("Compose", "Send").
- **Count** (Mono 700, 2.5rem, 0.9, tabular): the tray's selection count.
- **Title** (750, 1.0625rem, -0.005em): section headings and server names.
- **Body** (400, 1rem, 1.45): inputs and prose; prose capped at about 56ch.
- **Label** (650, 0.875rem): every form label, nav items, buttons.
- **Meta** (400, 0.8125rem): summaries, hints, secondary lines.
- **Data** (Mono, 0.8125rem, tabular): counts, budgets, widths, IDs.
- **Key** (Mono 600, 0.75rem): key caps.

### Named Rules

**The Measurement Rule.** Monospace is for things that are measured or identified: counts, limits, widths, IDs, keys. Never for labels or headings.

## Layout

- **Bar:** a 3.75rem sticky top bar with four items: the brand left, the Compose/Send/History/Templates segmented control centred, and a right cluster of the bot status, Shortcuts, the signed-in name badge (Discord sign-in), Sign out and the theme switch, all on one line from 640px up. Above 860px the brand and the right cluster each get an equal share of what the control leaves, so the control stays centred and nothing can run under it. The bar fits by shedding, measured rather than set by breakpoints, because the room it needs depends on the sign-in mode, both names and the root font size. The cluster sheds words first: the theme switch's "Dark theme", then Shortcuts' word (its `?` cap stays), then the name badge (Sign out carries the name in its label and title), then Sign out's word. Only after that does the bot's name shorten, with an ellipsis, and it never wraps. At 860px and below the control sits between brand and cluster and the cluster keeps only icons; below 720px the brand is its mark alone; on phones (640px and below) the bot status shrinks to its avatar or initial (see Components). Below 640px, in every sign-in mode, the control takes a full-width second row under the brand and the cluster, its segments equal in width and at least 2.75rem tall, so four views fit at 320px; labels are never cut short, and at 400px and below they step down to the meta size. The same measuring catches a bar that can't hold one row at any width, such as a 150% root font size on a tablet: it first moves the control to the second row, and only if the first row still can't hold the rest does it drop the brand's name, then the bot's name, one change at a time, so nothing overlaps. Shed words stay readable by screen readers through the one shared visually-hidden rule in `base.css`. The bar is fitted once on load whatever the browser supports, and observers keep it fitted; whatever they report in one frame is refitted once, in the next frame. Its height is measured into `--bar-height`, so sticky controls clear both rows. Resizing moves the thumb with its item at once; only choosing another view slides it.
- **Breakpoints:** desktop above 1100px, tablet 701–1100px, stacked 700px and below, phone 640px and below.
- **Compose, desktop:** `minmax(22rem, 1fr)` editor, a 2.75rem resize handle, and the preview column at the operator's chosen width (`--preview-w`, 320–760px, default Desktop 640px). The preview column and handle are sticky under the bar. The preview never squeezes the editor below 22rem.
- **Compose, tablet:** the same three columns with 16px page gutters, so a 768px tablet keeps the editor (22rem) and a preview of about 340px side by side, and the handle can trade width between them. A preset wider than the room left keeps its pressed state and takes what room there is; the readout shows the real width. The preview scrolls with the page instead of sticking, since at this width it is often taller than the screen.
- **Compose, stacked (700px and below):** one column; an Edit/Preview toggle pins under the bar; the forward action moves to a fixed bottom bar with the embed-text count. On phones (640px and below) the preview runs edge to edge and the width presets step aside.
- **History:** view head ("Every send, filed with its results." and **Refresh**), then a search field ("Message text, server or channel") with a **Filters** button that opens server, channel, date range and status selects plus **Clear filters**, then one ruled list of sends: a colour chip, the title, the time, a mono channel count, the status and an arrow. Older sends are paged with Previous and Next. A send opens on its own detail screen ("Send details", **← Back to history** with its Esc cap): the message preview and the channel results side by side, stacked on narrow screens.
- **Templates:** view head plus one ruled sheet, capped at `--templates-max` (68rem). Each row puts the small preview (20rem) beside the name and actions; at 700px and below the preview sits above them at full width.
- **Send:** view head (with the server and channel totals, the time the list was fetched and **Refresh**), the message slip (see Components), then the catalogue (see Components), capped at 92rem.
- **Spacing:** 4 / 8 / 12 / 16 / 24 / 32 / 48 (`--space-1` to `--space-7`). More space above a heading than below it; sections pad 24px (16px on phones).
- Tap targets are at least 2.75rem everywhere; no horizontal scrolling at 360, 768 or 1280px.

## Elevation & Depth

Three layers, each a soft offset shadow plus a hairline: the desk (flat), sheets and frames (`--shadow-2`), and the tray (`--shadow-2` plus `--tray-edge`, an inner top highlight; in dark also a 1px edge so it separates from the desk). Small lifted pieces (segmented thumbs, the grip, the next-step card) use `--shadow-1`. Things in flight (the filing slip, the shortcuts dialog) use `--shadow-lift`. No zero-offset halos, no hard block shadows.

## Shapes

Gently rounded, in four steps: 4px for tags, key caps and label holders; 6px for quiet buttons and checkboxes; 10px for inputs, primary buttons and thumbs; 14px for sheets, frames, segmented tracks and the tray (a track's radius is its thumb's plus its inset). Lists are ruled, not boxed: rows are divided by 1px rules that run to the sheet's edges.

## Components

### Buttons

- **Primary:** teal fill, on-accent text, 750 weight, 10px radius, 3rem tall, an arrow when it moves forward, and its key cap. Hover darkens; press nudges down 1px.
- **Quiet:** text-only teal (or secondary ink for neutral actions) with a teal wash on hover, 2.75rem tall.
- **Theme switch:** a real `role="switch"` labelled "Dark theme": a pill track with sun and moon, a knob that slides between them.

### Inputs

- 1px `--field-line` border on `--field`, 10px radius, 2.75rem minimum height. Hover darkens the border; focus draws a teal border, a 1px ring and a 4px teal wash. Labels are always visible above; placeholders are only examples.
- **Counts:** mono, top right of the control, hidden until focus or past 90% of the limit (see Signature elements). Screen readers get "240 of 256 characters".
- **Focus hints** open beneath a control only while it has focus.

### Segmented control

A rounded track on the desk colour with one sliding thumb (sheet colour, shadow-1, hairline). Used for the views nav (links with `aria-current`), and as a group of toggle buttons with `aria-pressed` for Edit/Preview and the width presets. When nothing is active (a custom preview width) the thumb fades out.

### Composer sheet

Sections, top to bottom: **Message** (message text), then one section per embed, then **Add embed** with a mono "2 of 10".

- **Embed section:** "Embed 1" with the side colour on the heading (swatch picker plus a mono hex box that accepts `0d9488`, `#0D9488` or `#09a` and tidies it on blur); title with its link folded into one line under it ("Title links to … Change", or "Title link Add"); description; **Fields** (numbered ruled list, "4 of 25", **Add field**); **Optional parts** (Author, Images, Footer and time as one-line summaries that say what opening them is for); and a quiet action row: Duplicate, Remove, and Move up / Move down once there is more than one embed.
- **Disclosure rows:** every folded row (title link, each field, each optional part) is a full-width button with `aria-expanded` and a chevron at the right that turns over when the row opens; the open row takes `--sheet-2`. A closed row with a problem inside shows "✗ Needs a fix" in place of its tag. Rows start closed; adding a field opens it and puts the cursor in its name.
- **Field rows:** open to Name, Value, an "Inline: sits beside other inline fields" checkbox, and Up, Down and Remove. Moving an embed or field keeps focus on the button that moved it, and the moved part settles into place.
- **Footer time:** a radio choice of No time, Time of sending, or A set time with a date-time picker. Like the Inline checkbox and the mention form's Member/Role/Channel choice, each option's whole 2.75rem row is its target: the native input covers the row invisibly, a drawn mark (a ring, or a box with a tick) shows its state, and the focus ring circles the row.
- **Folding embeds:** once a message has more than one embed, each heading is a fold button (chevron, `aria-expanded`). Folded, an embed is one line: "Embed 3", a dot in its side colour, its title (or the first line of its description), a mono field count and "✗ Needs a fix" when anything inside has a problem. The action row stays, so folded embeds can still be reordered. New and duplicated embeds arrive open, and going to a problem unfolds its embed.
- **Draft state:** under the view title, "Saved in this browser": every change autosaves to localStorage. If a write fails (storage full, blocked or the draft can't be stored), the status turns to "✗ Not saved" in danger ink and a danger-wash notice under the head explains that a reload would lose the changes and what to do. The draft stays in memory, and the next change tries again. A quiet **Clear** asks first in a small dialog ("Clear the draft?", Cancel focused, **Clear draft** in danger ink on its wash).
- **Files:** a section at the end of the sheet. Its drop zone is a ruled slip (a dashed `--line-strong` rule) holding a real **Choose files** button and "or drop them here", so dragging is never the only way in; its rule turns accent and it takes `--accent-wash` while a file is dragged over. A meta line gives the limits (files per message, MB each, MB together) and a mono "2 attached, 3.1 MB". Each file is a ruled row: a thumbnail for images or a file icon, the name, a mono size, and a quiet **Remove**. A row uploading shows a spinner and "Uploading 2 MB…"; a refused or failed one shows ✗ and the specific reason in danger ink, with **Dismiss**; a file the server no longer has shows ✗ "No longer on the server". Clearing the draft deletes its files.
- **Broken images:** an image link field (author icon, large image, thumbnail, footer icon) whose picture doesn't load says so under the field, once typing pauses ("This image didn't load…" with an image-off icon), as well as in the preview's placeholder. A validation problem on the same field takes its place until it is fixed.
- **Use an uploaded image:** one quiet line under each image link field (author icon, large image, thumbnail, footer icon). With images uploaded it is a label and a short select of their names that fills the field with `attachment://name`; with none it reads "Or use an uploaded image." and an **Upload in Files** link button that takes focus to Choose files.
- **First run:** the composer opens blank. A quiet line at the top of the sheet ("A new message. Write it below, or start from an example…") offers **Start from an example**, which fills in a text-only example. The example has no media links, because anything bundled with a self-hosted app is usually out of Discord's reach. While the draft is blank, the next-step card reads "Nothing to send yet" rather than listing problems.

### Message JSON

- **Entry points:** **Import JSON** (file-in icon) and **Export JSON** (file-out icon) are quiet buttons on their own line in Compose's head, under Save as template and Clear; on phones the pairs sit two by two.
- **Dialogs:** the small dialog, wider (`--notice-max`). Import offers a **Choose a file** slip like the composer's Files (a dashed slip holding the real button, then the chosen file's name, or "or paste the JSON below"), then the "Message JSON" textarea and **Replace draft**; a non-blank draft is asked about first. Export shows the JSON read-only with **Copy JSON** and **Download JSON**. Errors are a ✗ row in danger ink; outcomes ("File ready to import.", "JSON copied.", "JSON downloaded.") are a ✓ row with the tick in teal; a compatibility notice lists unsupported fields. On phones the actions sit in an even two-column grid and an odd last one (Download) takes the whole row.
- **Messages:** a malformed file says where the problem is in composer terms ("Embed 1 title must be text."); an empty message list says it must contain at least one message, and anything else unrecognised says that part "is not valid". After an import, a note under the head says the message was imported and lists any compatibility notices; it goes as soon as the imported draft is edited or cleared, since it no longer describes what is there.

### Dialogs

Every dialog is a native modal `dialog`: it opens with focus on a sensible control (Cancel when the action can't be undone), keeps Tab inside (Tab from the last control wraps to the first, and Shift+Tab back), closes on Esc and returns focus to what opened it.

### Formatting editor

Message text, description and field values are plain textareas holding Discord markdown, so typing it by hand always works. While one is in use a toolbar opens beneath it, like a focus hint, so idle fields stay plain: Bold, Italic, Underline, Strikethrough, Link | Inline code, Code block, Spoiler | Quote, List, Heading | Mention, Timestamp, in 2.75rem icon buttons grouped by hairlines. It is one `role="toolbar"` tab stop moved with ←/→/Home/End; clicking a button never takes focus from the text, so the selection stays. A readout at the right names the hovered or focused command with its key cap. **Ctrl/⌘ + B, I, U, K** work in the textarea and press their toolbar button the way a shortcut presses a key cap. A command pressed from the keyboard keeps focus on its button, so several can be applied in a row; Mention and Timestamp move focus into their form. On phones (640px and below) the toolbar stays one row that scrolls sideways, and the readout steps aside. On touch screens a meta line under each formatting field, "Formatting tools open below while you type.", stands in for the printed key caps and hides once the field is in use. On stacked screens the page's scroll padding clears the pinned bar, the Edit/Preview toggle and the bottom action bar, so focused fields and opened insert forms land in view. Commands toggle (bold on bold text removes it; italic on bold makes bold italic) and are inserted natively, so Ctrl/⌘+Z undoes them. Link selects what is still to be typed. Mention and Timestamp open a small form in the toolbar's tray (member, role or channel plus an ID; a date-time and one of Discord's seven display styles, each with a sample); Enter inserts, Esc cancels and returns to the text.

### Validation

Every Discord rule lives in `validateMessage` in `packages/shared`. A control shows its problem (✗ icon and words, red border, `aria-invalid`) once it has been left; counts still turn red the moment text passes a limit. While anything is wrong, the next-step card becomes "✗ 3 problems to fix before sending" with each problem as a ruled row ("Embed 1, field 5 value: Add a value; …") that opens whatever hides the control, shows its message and focuses it. **Choose channels** stays visible but `aria-disabled`, greyed, described by the summary, and pressing it (or Ctrl/⌘ ↵) goes to the first problem. On stacked screens the action bar's count becomes "✗ 3 to fix" (read out as "3 problems to fix"), which does the same. An empty embed's problem carries its own way out beside it, in link colour and underlined so it reads as the fix: **Remove this embed**, or **Remove all 3 empty embeds** when there are several, in one step. An empty embed is never part of what is sent, saved as a template or exported. An embed added with **Add embed** isn't a problem until something is written in it: until then a meta line under its heading says "Not sent until you write in it.", the preview and summaries leave it out, and a reload keeps it that way. On a blank draft, **Choose channels** and Ctrl/⌘ ↵ don't list problems: the starter line above the message turns to the accent wash and says "Nothing to send yet", it is scrolled into view clear of the sticky bars, and the cursor goes to the message text without scrolling it away.

### Preview column

A width bar (label, Desktop/Phone presets, mono readout), the preview frame (a strip with "Live preview" and "Discord dark/light", then the Discord message), and a next-step card ("Looks right? Pick where it goes next." with **Choose channels**). Squeezed below `--preview-min` (only a root font size the em breakpoints can't see does that), the presets drop their icons and Choose channels its key cap, so nothing scrolls the page sideways.

### Resize handle

A 2.75rem column between editor and preview with a 1px rule and a grip. Hover, drag and focus turn the rule teal and double its width; focus rings the grip. Keyboard: ←/→ move 16px (Shift: 64px), Home/End go to the minimum and maximum. Double-click returns to Desktop. Exposed as a vertical `separator` with its width as the value.

### Bot status

In the bar: "● Bot **Name**" (avatar if the bot has one), "Connecting to Discord…" with a pulsing dot while loading, and "✗ Not connected" with **Retry** on failure. On tablets the name is shortened with an ellipsis if needed. On phones it shrinks to the avatar, or the bot's initial on a teal disc, and the loading dot; the full text stays available to screen readers. On phones a failure moves out of the bar into a notice above the view with the full message and **Retry**.

### Key caps and shortcuts

`kbd` in Mono on the sheet colour with a hairline and an inset bottom edge. Shortcuts: **Ctrl/⌘ + Enter** goes forward (Compose → Send), **Esc** goes back (Send → Compose; on phones, Preview → Edit), **/** focuses a view's search, **?** opens the shortcut list. Letter and symbol shortcuts pause while the operator types. Browser-reserved combinations (Alt+number and similar) are never used. Controls with a shortcut carry `aria-keyshortcuts`; the printed cap is hidden from screen readers.

### Closed catalogue (Send states)

When there is nothing to pick from, Send shows one sheet with a closed catalogue drawer whose label holder names what is missing, a plain statement, the next action and **Back to Compose** with its Esc cap: "Not listed" with the cause and **Retry** when Discord can't be reached, "No servers" with **Invite the bot** (an invite asking for exactly the four checked permissions) and **Refresh** when the bot is in no servers. While the list loads, a still skeleton of the rail, search, catalogue rows and tray holds the layout. A failed refresh keeps the last list and shows the cause above it.

### Failures

Every failure the app shows is mapped in one place (`apps/web/src/errors.ts`) into one sentence: what couldn't happen, then the cause and the next step ("Couldn’t load servers: the bot may be offline, or the app can’t reach Discord. Check the connection, then retry."). The status, the server's error code and its own wording sit behind a **Details** disclosure under the sentence (a native `details`, 2.75rem summary, chevron that turns over, mono text in the notice's own ink); raw response bodies are never shown. Sign-in's Details hold only the status and code, since the server's wording only restates the sentence. Where a heading already names what failed (a closed drawer's "The servers couldn’t be listed"), the sentence gives only the cause and next step, so the heading isn't repeated. A sign-in refused behind an HTTPS proxy the server doesn't trust names `TRUST_PROXY` and `PUBLIC_URL` as the fix.

### Templates

Messages saved to start new ones from, shared by everyone who signs in to the instance.

- **Save as template:** a quiet button in Compose's head, beside Clear, opens a small dialog with a visible "Template name" label, a quiet count (100 characters) and a name suggested from the first embed's title or the message's first line. An empty or overlong name is explained on blur; the server's refusal shows inside the dialog. Once saved, a line under the head reads "✓ Saved as template **Name**." with **Open Templates**.
- **List:** one sheet, one ruled row per template, most recently updated first. A row is the small preview (the real Discord preview at the Desktop width, drawn at half size, cut off at `--mini-h`, hidden from screen readers and inert), then the name, a meta line ("1 embed · 4 fields · 1 file · Updated" and the date in the body face with tabular figures; "Updated" and its date never wrap apart), and the actions in an even grid, so every row's line up: **Start a message** (a bordered teal button with an arrow), Rename, **Overwrite with Compose** and Delete. A short message gets a short preview frame; a long one is cut off at `--mini-h`. While Compose is empty, Overwrite stays in place but unavailable (`aria-disabled`, faded), and a meta line on its own line under the view's heading, aligned with it, explains why, so rows never change shape. A template whose files the server has lost says so in danger ink with ✗ and the file names.
- **Start a message:** with a blank composer the template loads at once; otherwise a dialog asks first ("Replace the message in Compose?", Cancel focused, **Replace message** in danger ink). Compose opens with a note naming the template; if files are missing the note becomes a danger-wash notice naming them, and the files are marked under Files as usual.
- **Rename** reuses the name dialog; **Overwrite** and **Delete** confirm in the small dialog. After a delete, focus returns to the view heading. A change that fails shows a danger-wash notice naming the template and the cause.
- **States:** loading is a still skeleton of three rows; the empty state and a failed load use the closed drawer at the list's full width ("No templates" with **Write a message in Compose** or **Save the composer's message**; "Not loaded" with the cause and **Retry**).

### Channel catalogue

The reference mock lives outside the repo at `~/forge-artifacts/embed-dash/design/send-catalogue/`. As built:

- **Layout above 1100px:** three columns: a **server rail** (15.5rem), the **catalogue**, and the **tray** (22rem). 861–1100px: catalogue and tray; the rail becomes a strip. 860px and below: one column; the tray becomes a bottom sheet with the count, a **Show**/**Hide** toggle for its slips and the Send button, and its note (the result count after a send, or why Send waits) sits above the buttons. The page's scroll padding is measured from the sticky search above the catalogue and the tray sheet below it, so keyboard focus always stops clear of both.
- **Search:** "Find channels", always one keystroke away (`/`), matching channel names, server names and IDs as you type; every word has to match somewhere, so "news cup" finds #news in the Cup servers. Hits are marked in the name and inside the call number. ↓ or Enter from the search enters the list; ↑/↓ move (↑ from the first entry returns to the search), Home/End jump, Space or Enter ticks, Esc clears the search first. Only the current entry is in the tab order. The browser's own clear button is replaced by an ✕ button while there is a query.
- **Server rail (scales to many servers):** a sticky list of every server: its Discord icon (2rem, 10px radius) or, without one, the drawer label holder with initials; the name; and a mono ticked/postable count ("4/38", the ticked number in teal). A "Filter servers" field sits on top once there are more than eight. Clicking a server jumps the catalogue to its drawer and focuses the drawer header; the server whose drawer is in view is marked with the sheet colour and a hairline (no coloured side stripe). On narrower screens the rail becomes a horizontally scrolling strip of icons/holders with counts under the search.
- **Quick picks** under the search, as quiet bordered buttons with mono counts: **Main channel of each server** (the server's system channel if the bot can post there, otherwise its first announcement channel, otherwise its first postable text channel), **All postable**, and **Clear**. Each drawer header has **Select all** (postable channels in that server, within the current search) which turns into **Clear** when all are ticked.
- **Drawers:** one per server: header on `--sheet-2` with a chevron that folds the drawer to its header, the icon or label holder and name, and beneath the name the call-number ID and "4 of 38 ticked" (hidden on phones), with Select all at the end. Drawers with more than ten entries show the first eight plus "32 more channels in this drawer · Show all"; offscreen drawers skip layout and paint (`content-visibility`), so long catalogues stay smooth. With a search, servers without hits drop out of the catalogue.
- **Entries:** checkbox (one drawn box with a tick that strokes in), call number, channel-type icon and name, type label. Icons (Lucide): `Hash` for text, `Megaphone` for announcement, `MessagesSquare` for forum ("Forum (new post)"). The main channel carries a small mono "MAIN" tag. The call-number column is 11rem, enough for a 20-digit ID. Channels the bot can't post in stay listed with a dashed box, a lock line with the reason ("Bot is missing Send Messages here") and `aria-disabled`. A channel that only lacks Attach Files stays postable and its type label adds "· no uploads".
- **Catalogue cursor:** for keyboard users one focus frame glides from row to row instead of each checkbox drawing its own ring.
- **Tray:** deep ink; "Tray", "14 channels in 5 servers", and the large mono count that rolls up or down when it changes. Slips (channel name, server, ✕ to take it out) are grouped under server names once the tray holds more than eight, with the overflow past twelve folded ("+ 5 more · Show"). Taking a slip out moves focus to the next slip. The button reads "Send to 14 channels" and opens a confirmation with the message summary, the channel count and the destinations by server; it is disabled (dashed, in `--tray-soft`) with a one-line reason when nothing is ticked or the draft has problems. Above it sit the delivery options (pings per kind with a warning, silent send), both off. While the send runs it reads "Sending 3 of 14…" (disabled) and the note under it states the ping and silent settings actually in use; the catalogue's entries, quick picks and Select all are locked until every channel has an answer. A locked entry sits on `--sheet-2` with a dashed box and `--ink-2` text (so it reads as locked without a cursor), and a lock line inside the sticky search bar says why; the tray's note repeats that channels stay locked, since on narrow screens the bar isn't pinned. After a send, the tray offers **Compose a new message** (the main button once nothing failed; below **Retry** otherwise) and **Keep this draft**. Compose a new message asks first ("Start a new message?", Cancel focused), then clears the draft, the ticks and the delivery options and goes to Compose. Keep this draft returns to choosing channels for the same message, with the channels that got it unticked. Both are disabled the same way as Send (dashed, in `--tray-soft`) while a send runs.
- **Message slip:** under the view title, one ruled slip on the sheet colour states what is being sent: "Sending", a dot in the first embed's side colour, the title (or the first line of the text), the parts with mono counts ("text · 1 embed · 2 files") and **Edit in Compose**. On phones Edit in Compose joins the "Sending" line and the title takes the full width beneath, so the first channel stays above the fold. A blank draft reads "Nothing written yet" with **Write it in Compose**. The confirmation repeats it and also lists the files (name and mono size) and both delivery settings: who mentions notify and whether the push goes out.
- **Already received:** channels that got the message now in the composer during this session carry an accent line under the entry ("Already has this message", or "May already have this message" when Discord didn't confirm) and on their tray slip; the confirmation warns that they'll get a second copy. Editing the message clears the marks, since it is no longer the same message.
- **Result slips** (with sending): the server records the send first and delivers in the background, and the tray asks how far it has got about once a second, so each slip changes from a spinner and "Sending" to ✓ Sent (with "Open in Discord"), ✗ Failed or ? Unconfirmed (a post that got no answer; no retry, a link to the channel instead) as its channel completes. A failed slip shows the cause ("The bot isn’t allowed to post in this channel. …") and its own **Retry**; failed slips are never folded away. The summary line reads "3 of 14 sent." while it runs and rises in as the final tally ("13 sent, 1 failed. …") when it ends. If the server can't be reached the line says so and polling goes on with the same send id; Send is not offered again. A send whose request was dropped before the server stored it is asked for again under that id, so it is posted once or reported as refused, never reported as unposted while the server may still post it. The id and request are kept for the browser session, so reloading mid-send shows the progress again. Colour is never the only signal: icon plus word every time.
- **Send blocked**: if the draft has problems, the tray shows them as a list with "Go to the field" links (no one-click fixes yet), and the Send button stays disabled. A file the server no longer has is such a problem, shown on the file and on every image field that uses it.

## Motion

All motion uses `--ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`) for arrivals; `--ease-in` is reserved for quick departures (a slip leaving the tray). Durations: `--dur-fast` 120ms, `--dur-base` 200ms, `--dur-move` 320ms, `--dur-file` 520ms, `--dur-wipe` 560ms. Animations use transform, opacity and clip-path only.

**Input is never held.** Moving between views never waits for an animation: only the incoming view animates, the outgoing one is removed at once, and a second click mid-animation simply starts the next view. The theme wipe is the one effect that uses a View Transition; any key or pointer press skips it, and a click caught by the transition's overlay is passed on to the element under the pointer.

| Transition                | What it does and why                                                                                                                                                                                                           | Reduced motion                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Login sheet arrival       | The index sheet rises 0.75rem and inks in over 320ms with `--ease-out`, orienting the operator to the instance address.                                                                                                        | Instant; no animation.                |
| View change               | The incoming view slides 2.5rem in from the side of its tab and fades in (320ms), so Compose → Send reads as moving right and back as moving left.                                                                             | Instant swap.                         |
| Segmented thumb           | The thumb slides to the chosen item (320ms); placed without animation on load.                                                                                                                                                 | Instant.                              |
| Theme wipe                | The new theme is clipped in from the top down over the old (560ms), like a card pulled over the desk. Without View Transitions, colours fade (200ms).                                                                          | Instant swap, no wipe.                |
| Theme switch knob         | The knob slides between sun and moon (320ms).                                                                                                                                                                                  | Instant.                              |
| Key cap press             | The cap drops 1px and inks teal for 160ms when its shortcut fires, so the keyboard layer visibly answers.                                                                                                                      | Same press, without easing.           |
| Count reveal              | A count fades in on focus (200ms).                                                                                                                                                                                             | Instant.                              |
| Focus hint                | Opens beneath its control (200ms, grid rows).                                                                                                                                                                                  | Instant.                              |
| Formatting toolbar        | Opens beneath its textarea while it is in use (200ms, grid rows and fade), so idle fields stay plain; its insert forms drop in 4px (200ms).                                                                                    | Instant.                              |
| Disclosure row            | The body opens to its height (320ms, grid rows) and the chevron turns over (200ms), so the row reads as the lid of what it holds.                                                                                              | Instant.                              |
| Embed fold                | The chevron turns over (200ms); the folded body is removed at once, so nothing below waits.                                                                                                                                    | Instant.                              |
| Moved part                | An embed or field that moved rises 0.5rem into its new place from 40% opacity (320ms), so the eye finds where it went.                                                                                                         | Instant.                              |
| Budget ruler              | The fill grows with the text (320ms, scaleX).                                                                                                                                                                                  | Instant.                              |
| Resize handle             | Rule and grip ink teal on hover, drag and focus (120ms).                                                                                                                                                                       | Instant.                              |
| Preview pane (phones)     | The preview rises 0.5rem into place when its tab opens (320ms).                                                                                                                                                                | Instant.                              |
| Template settles          | A saved, renamed or overwritten template rises 0.5rem into its place at the top of the list from 40% opacity (320ms), and the saved line under a view head does the same, so the eye finds what changed.                       | Instant.                              |
| Nothing to send yet       | On a blank draft, the forward action turns the starter line to the accent wash and its words rise 0.5rem (200ms), so the refusal is seen where the writing starts.                                                             | Instant.                              |
| Shortcut list             | The dialog rises 0.5rem as it opens (200ms).                                                                                                                                                                                   | No animation.                         |
| Small dialogs             | Confirmations, the template name dialog and the JSON dialogs rise 0.5rem as they open (200ms), the same arrival as the shortcut list.                                                                                          | No animation.                         |
| Connecting dot            | Pulses while the bot loads.                                                                                                                                                                                                    | Static dot.                           |
| Filing                    | Ticking an entry sends a teal slip in an arc from the row to its sorted place in the tray (520ms), where the slot opens and the new slip settles. Skipped for Select all and quick picks (slips open in place).                | No flight; the slip appears in place. |
| Tray arrival              | The tray arrives from the right on desktop, rises from the bottom on phones (520ms).                                                                                                                                           | Instant.                              |
| Count roll                | The tray's numeral rolls up or down by one step when it changes (320ms).                                                                                                                                                       | Instant.                              |
| Catalogue cursor          | The keyboard focus frame glides between entries (200ms), so the eye follows one frame instead of rings blinking on and off.                                                                                                    | Jumps.                                |
| Tick                      | The tick strokes into the box and the entry takes the teal wash (200ms).                                                                                                                                                       | Instant.                              |
| Slip slot                 | A new slip's slot opens in the tray (200ms) as the filing slip lands.                                                                                                                                                          | Appears in place.                     |
| Drawer fold               | The chevron turns as a drawer folds or opens (200ms).                                                                                                                                                                          | Instant.                              |
| _Result reveal_ (sending) | Each slip's ✓ or ✗ draws its stroke and its word inks in left to right when that channel's outcome arrives (a poll can bring several at once; the stagger between slips is capped at eight steps); the final summary rises in. | Shown at once; spinners stop.         |

## Do's and Don'ts

### Do:

- **Do** use tokens from `apps/web/src/styles/tokens.css` for every colour, size, space, radius, shadow, duration and easing.
- **Do** keep the composer one sheet with ruled lists; add new parts as sections or one-line disclosure rows.
- **Do** print a key cap for every shortcut and give the control `aria-keyshortcuts`.
- **Do** show counts on focus or past 90% of a limit, never permanently on idle fields.
- **Do** give every data view a loading, empty and error state with a next action, and pair every status colour with an icon and words.
- **Do** keep the preview in Discord's exact colours and metrics, including where they fall below the app's own type rules (14/18px field text, the 10px APP tag).

### Don't:

- **Don't** box sections or rows inside the sheet (no cards inside cards), and don't add coloured side stripes thicker than 1px.
- **Don't** add a second accent colour, gradients (other than the ruler ticks), glass or glow.
- **Don't** use monospace for labels or headings.
- **Don't** use View Transitions or delays for navigation, and never let an animation swallow a click or key press.
- **Don't** bind shortcuts the browser or screen readers reserve, such as Alt+number.
- **Don't** use Discord's logo, proprietary font or chrome outside the preview.

The login uses a wider index sheet, hairline rules, and the instance address as a mono identifier. The sheet is centred vertically with a little more room below than above, so on tall screens it sits just above the middle; the brand and theme switch come before it in both reading and tab order. A heading that script focuses (the not-allowed explanation) draws no focus ring, since it is not a control. Sign out sits in the header beside the shared sun/moon theme switch.

## Editing sent messages

An edit opens an accent-wash sheet above the composer. Its heading receives focus and names the message, original send time and confirmed copy count. Read-only destinations use the catalogue’s hash marks and mono call numbers; rows without a confirmed message explain that they are skipped. The sheet uses `--edit-wash` (the accent wash) and `--edit-rule` (the stronger rule) in both themes.

The sheet arrives with the composer under it, as part of the view's own arrival (instant under reduced motion), so nothing below shifts after it. Save updates replaces the ordinary Send path in the preview’s sticky action area and in the fixed action bar, which editing pins to the bottom on tablets as well as phones (up to 68.75em), where the preview scrolls with the page. With the preview beside the composer, an update's results and any failure to start it show under Save updates, and the sticky preview column scrolls on its own while editing so they can be reached; where Save updates is pinned to the bottom they show in the sheet. Either way, a new update's results or a failure to start or follow it are scrolled into view; results restored on opening the editor stay where they are. Clear and Save as template are hidden while editing. Closing a dirty editor uses the shared confirmation, Cancel returns focus to Close editor, and leaving restores the earlier local draft and focuses the composer heading. Results use Send’s deep-ink slips and status components.

History marks entries with copies that have not reached the saved version. In the detail view, delivery and latest-update outcomes have separate labels; eligible failures offer Retry update. Reopening an editor restores unfinished update slips while earlier successes stay hidden.
