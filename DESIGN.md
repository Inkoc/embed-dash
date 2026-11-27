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
- **Access warning** (`--access-warning`): amber ink with a triangle icon on the ruled header notice for open instances. It stays visible with the header; composer sticky offsets include its measured height.
- **Mark** (`--mark`): search-hit highlight in the catalogue.

### Discord preview (fixed, not themable)

`--dc-*` tokens reproduce Discord's chat: dark `#313338` / embed `#2b2d31`, light `#ffffff` / embed `#f2f3f5`, text, header, muted and link colours, and the blurple "APP" tag. In light the link is darkened to `#0063d3` so it passes AA on the embed.

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

- **Bar:** a 3.75rem sticky top bar: brand left, the Compose/Send segmented control centred, the bot status, Shortcuts and the theme switch right. All of them stay at every width; below 1100px Shortcuts shrinks to its `?` cap, below 860px the theme switch drops its visible label, and on phones the bot status shrinks to its avatar (see Components).
- **Breakpoints:** desktop above 1100px, tablet 701–1100px, stacked 700px and below, phone 640px and below.
- **Compose, desktop:** `minmax(22rem, 1fr)` editor, a 2.75rem resize handle, and the preview column at the operator's chosen width (`--preview-w`, 320–760px, default Desktop 640px). The preview column and handle are sticky under the bar. The preview never squeezes the editor below 22rem.
- **Compose, tablet:** the same three columns with 16px page gutters, so a 768px tablet keeps the editor (22rem) and a preview of about 340px side by side, and the handle can trade width between them. A preset wider than the room left keeps its pressed state and takes what room there is; the readout shows the real width. The preview scrolls with the page instead of sticking, since at this width it is often taller than the screen.
- **Compose, stacked (700px and below):** one column; an Edit/Preview toggle pins under the bar; the forward action moves to a fixed bottom bar with the embed-text count. On phones (640px and below) the preview runs edge to edge and the width presets step aside.
- **Send:** view head plus the catalogue (see Components). The baseline's empty state is a short statement, so the view is capped at 56rem and centred.
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
- **Footer time:** a radio choice of No time, Time of sending, or A set time with a date-time picker.
- **Folding embeds:** once a message has more than one embed, each heading is a fold button (chevron, `aria-expanded`). Folded, an embed is one line: "Embed 3", a dot in its side colour, its title (or the first line of its description), a mono field count and "✗ Needs a fix" when anything inside has a problem. The action row stays, so folded embeds can still be reordered. New and duplicated embeds arrive open, and going to a problem unfolds its embed.
- **Draft state:** under the view title, "Saved in this browser": every change autosaves to localStorage. If a write fails (storage full, blocked or the draft can't be stored), the status turns to "✗ Not saved" in danger ink and a danger-wash notice under the head explains that a reload would lose the changes and what to do. The draft stays in memory, and the next change tries again. A quiet **Clear** asks first in a small dialog ("Clear the draft?", Cancel focused, **Clear draft** in danger ink on its wash).
- **First run:** the composer opens blank. A quiet line at the top of the sheet ("A new message. Write it below, or start from an example…") offers **Start from an example**, which fills in a text-only example. The example has no media links, because anything bundled with a self-hosted app is usually out of Discord's reach. While the draft is blank, the next-step card reads "Nothing to send yet" rather than listing problems.

### Formatting editor

Message text, description and field values are plain textareas holding Discord markdown, so typing it by hand always works. While one is in use a toolbar opens beneath it, like a focus hint, so idle fields stay plain: Bold, Italic, Underline, Strikethrough, Link | Inline code, Code block, Spoiler | Quote, List, Heading | Mention, Timestamp, in 2.75rem icon buttons grouped by hairlines. It is one `role="toolbar"` tab stop moved with ←/→/Home/End; clicking a button never takes focus from the text, so the selection stays. A readout at the right names the hovered or focused command with its key cap. **Ctrl/⌘ + B, I, U, K** work in the textarea and press their toolbar button the way a shortcut presses a key cap. A command pressed from the keyboard keeps focus on its button, so several can be applied in a row; Mention and Timestamp move focus into their form. On phones (640px and below) the toolbar stays one row that scrolls sideways, and the readout steps aside. On touch screens a meta line under each formatting field, "Formatting tools open below while you type.", stands in for the printed key caps and hides once the field is in use. On stacked screens the page's scroll padding clears the pinned bar, the Edit/Preview toggle and the bottom action bar, so focused fields and opened insert forms land in view. Commands toggle (bold on bold text removes it; italic on bold makes bold italic) and are inserted natively, so Ctrl/⌘+Z undoes them. Link selects what is still to be typed. Mention and Timestamp open a small form in the toolbar's tray (member, role or channel plus an ID; a date-time and one of Discord's seven display styles, each with a sample); Enter inserts, Esc cancels and returns to the text.

### Validation

Every Discord rule lives in `validateMessage` in `packages/shared`. A control shows its problem (✗ icon and words, red border, `aria-invalid`) once it has been left; counts still turn red the moment text passes a limit. While anything is wrong, the next-step card becomes "✗ 3 problems to fix before sending" with each problem as a ruled row ("Embed 1, field 5 value: Add a value; …") that opens whatever hides the control, shows its message and focuses it. **Choose channels** stays visible but `aria-disabled`, greyed, described by the summary, and pressing it (or Ctrl/⌘ ↵) goes to the first problem. On stacked screens the action bar's count becomes "✗ 3 to fix" (read out as "3 problems to fix"), which does the same.

### Preview column

A width bar (label, Desktop/Phone presets, mono readout), the preview frame (a strip with "Live preview" and "Discord dark/light", then the Discord message), and a next-step card ("Looks right? Pick where it goes next." with **Choose channels**).

### Resize handle

A 2.75rem column between editor and preview with a 1px rule and a grip. Hover, drag and focus turn the rule teal and double its width; focus rings the grip. Keyboard: ←/→ move 16px (Shift: 64px), Home/End go to the minimum and maximum. Double-click returns to Desktop. Exposed as a vertical `separator` with its width as the value.

### Bot status

In the bar: "● Bot **Name**" (avatar if the bot has one), "Connecting to Discord…" with a pulsing dot while loading, and "✗ Not connected" with **Retry** on failure. On tablets the name is shortened with an ellipsis if needed. On phones it shrinks to the avatar, or the bot's initial on a teal disc, and the loading dot; the full text stays available to screen readers. On phones a failure moves out of the bar into a notice above the view with the full message and **Retry**.

### Key caps and shortcuts

`kbd` in Mono on the sheet colour with a hairline and an inset bottom edge. Shortcuts: **Ctrl/⌘ + Enter** goes forward (Compose → Send), **Esc** goes back (Send → Compose; on phones, Preview → Edit), **/** focuses a view's search, **?** opens the shortcut list. Letter and symbol shortcuts pause while the operator types. Browser-reserved combinations (Alt+number and similar) are never used. Controls with a shortcut carry `aria-keyshortcuts`; the printed cap is hidden from screen readers.

### Empty Send (baseline)

Until the app can list channels, Send shows the view head, then one sheet with a closed catalogue drawer whose label holder reads "No channels", a plain statement of what is missing, and **Back to Compose** with its Esc cap.

### Channel catalogue (designed for the channel picker; not built yet)

A static reference mock lives outside the repo at `~/forge-artifacts/embed-dash/design/send-catalogue/` (light, dark and 360px screenshots). The picker builds this:

- **Layout above 1100px:** three columns: a **server rail** (15.5rem), the **catalogue**, and the **tray** (22rem). 861–1100px: catalogue and tray; the rail becomes a strip. 860px and below: one column; the tray becomes a bottom sheet with the count and the Send button, and results also appear on each row.
- **Search:** "Find channels", always one keystroke away (`/`), matching channel names, server names and IDs; hits are marked in the name and inside the call number. ↓ from the search enters the list; ↑/↓ move, Space ticks, Esc clears the search first.
- **Server rail (scales to many servers):** a sticky list of every server: its Discord icon (2rem, 10px radius) or, without one, the drawer label holder with initials; the name; and a mono ticked/postable count ("4/38", the ticked number in teal). A "Filter servers" field sits on top once there are more than eight. Clicking a server jumps the catalogue to its drawer and focuses the drawer header; the server whose drawer is in view is marked with the sheet colour and a hairline (no coloured side stripe). On narrower screens the rail becomes a horizontally scrolling strip of icons/holders with counts under the search.
- **Quick picks** under the search, as quiet bordered buttons with mono counts: **Main channel of each server** (the server's system channel if the bot can post there, otherwise its first announcement channel, otherwise its first postable text channel), **All postable**, and **Clear**. Each drawer header has **Select all** (postable channels in that server, within the current search) which turns into **Clear** when all are ticked.
- **Drawers:** one per server: header on `--sheet-2` with icon or label holder, name, call-number ID, "4 of 38 ticked", and Select all. Large servers show their first rows plus "32 more channels in this drawer · Show all"; drawers with no ticks and no search hits can stay closed to their header.
- **Entries:** checkbox (one drawn box with a tick that strokes in), call number, channel-type icon and name, type label. Icons (Lucide): `Hash` for text, `Megaphone` for announcement, `MessagesSquare` for forum ("Forum (new post)"). The main channel carries a small mono "MAIN" tag. Channels the bot can't post in show a dashed box and a lock line with the reason ("Bot is missing Send Messages here").
- **Catalogue cursor:** for keyboard users one focus frame glides from row to row instead of each checkbox drawing its own ring.
- **Tray:** deep ink; "Tray", "14 channels in 5 servers", and the large mono count that rolls up or down when it changes. Slips (channel name, server, ✕ to take it out) are grouped under server names once the tray holds more than eight, with the overflow folded ("+ 5 more … · Show"). The button reads "Send to 14 channels" with its key cap; while sending "Sending 3 of 14…"; afterwards "Retry 1 failed".
- **Result slips:** each slip gets ✓ Sent or ✗ Failed as its channel completes; a failed slip opens to show the cause ("Discord didn't answer in time. Nothing was posted here.") and its own **Retry**. A summary line rises in under the button ("13 sent, 1 failed. …"). Colour is never the only signal: icon plus word every time.
- **Send blocked:** if the draft has problems, the tray shows them as a list with "Go to the field" links and one-click fixes where safe, and the Send button stays disabled.

## Motion

All motion uses `--ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`) for arrivals; `--ease-in` is reserved for quick departures (a slip leaving the tray). Durations: `--dur-fast` 120ms, `--dur-base` 200ms, `--dur-move` 320ms, `--dur-file` 520ms, `--dur-wipe` 560ms. Animations use transform, opacity and clip-path only.

**Input is never held.** Moving between views never waits for an animation: only the incoming view animates, the outgoing one is removed at once, and a second click mid-animation simply starts the next view. The theme wipe is the one effect that uses a View Transition; any key or pointer press skips it, and a click caught by the transition's overlay is passed on to the element under the pointer.

| Transition                  | What it does and why                                                                                                                                                                                            | Reduced motion                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Login sheet arrival         | The index sheet rises 0.75rem and inks in over 320ms with `--ease-out`, orienting the operator to the instance address.                                                                                         | Instant; no animation.                |
| View change                 | The incoming view slides 2.5rem in from the side of its tab and fades in (320ms), so Compose → Send reads as moving right and back as moving left.                                                              | Instant swap.                         |
| Segmented thumb             | The thumb slides to the chosen item (320ms); placed without animation on load.                                                                                                                                  | Instant.                              |
| Theme wipe                  | The new theme is clipped in from the top down over the old (560ms), like a card pulled over the desk. Without View Transitions, colours fade (200ms).                                                           | Instant swap, no wipe.                |
| Theme switch knob           | The knob slides between sun and moon (320ms).                                                                                                                                                                   | Instant.                              |
| Key cap press               | The cap drops 1px and inks teal for 160ms when its shortcut fires, so the keyboard layer visibly answers.                                                                                                       | Same press, without easing.           |
| Count reveal                | A count fades in on focus (200ms).                                                                                                                                                                              | Instant.                              |
| Focus hint                  | Opens beneath its control (200ms, grid rows).                                                                                                                                                                   | Instant.                              |
| Formatting toolbar          | Opens beneath its textarea while it is in use (200ms, grid rows and fade), so idle fields stay plain; its insert forms drop in 4px (200ms).                                                                     | Instant.                              |
| Disclosure row              | The body opens to its height (320ms, grid rows) and the chevron turns over (200ms), so the row reads as the lid of what it holds.                                                                               | Instant.                              |
| Embed fold                  | The chevron turns over (200ms); the folded body is removed at once, so nothing below waits.                                                                                                                     | Instant.                              |
| Moved part                  | An embed or field that moved rises 0.5rem into its new place from 40% opacity (320ms), so the eye finds where it went.                                                                                          | Instant.                              |
| Budget ruler                | The fill grows with the text (320ms, scaleX).                                                                                                                                                                   | Instant.                              |
| Resize handle               | Rule and grip ink teal on hover, drag and focus (120ms).                                                                                                                                                        | Instant.                              |
| Preview pane (phones)       | The preview rises 0.5rem into place when its tab opens (320ms).                                                                                                                                                 | Instant.                              |
| Shortcut list               | The dialog rises 0.5rem as it opens (200ms).                                                                                                                                                                    | Instant.                              |
| Connecting dot              | Pulses while the bot loads.                                                                                                                                                                                     | Static dot.                           |
| _Filing_ (picker)           | Ticking an entry sends a teal slip in an arc from the row to its sorted place in the tray (520ms), where the slot opens and the new slip settles. Skipped for Select all and quick picks (slips open in place). | No flight; the slip appears in place. |
| _Tray arrival_ (picker)     | The tray arrives from the right on desktop, rises from the bottom on phones (520ms).                                                                                                                            | Instant.                              |
| _Count roll_ (picker)       | The tray's numeral rolls up or down by one step when it changes (300ms).                                                                                                                                        | Instant.                              |
| _Result reveal_ (picker)    | Each ✓ or ✗ draws its stroke and its word inks in left to right as that channel completes; the summary rises in.                                                                                                | Shown at once; spinners stop.         |
| _Catalogue cursor_ (picker) | The keyboard focus frame glides between rows (200ms).                                                                                                                                                           | Jumps.                                |

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

The login uses a wider index sheet, hairline rules, and the instance address as a mono identifier. Sign out sits in the header beside the shared sun/moon theme switch.
