# Decisions

Choices that shaped the code, with the reason and what would change them.

## Preview markdown: discord-markdown-parser plus a list rule (27 November 2026)

**Decision.** The preview parses Discord markdown with [discord-markdown-parser](https://github.com/ItzDerock/discord-markdown-parser) 1.3.1 (Apache-2.0) and renders its syntax tree to React elements with our own renderer (`apps/web/src/preview/Markdown.tsx`). We add one rule of our own, for bulleted and numbered lists, which the package doesn't have.

**Why.** The package's grammar matched every fixture in `docs/preview-fidelity.md` except lists: inline styles, code, quotes, masked links, headings, subtext, spoilers, escapes, mentions with real 17 to 20 digit IDs, custom emoji and timestamps. The list gap was small and could be fixed with an extra rule, so a custom parser, with its grammar and security upkeep, wasn't justified. Discord's restricted embed parts (title, field names) use a subset of the package's rules; author and footer aren't parsed at all.

**Safety.** The package only produces a tree; nothing it parses becomes HTML. Link targets come through unfiltered (`javascript:` included), so the renderer turns only `http:` and `https:` targets into links and shows anything else as typed.

**Revisit if** a client check finds behaviour the package's rules can't express, or the package stops being maintained.
