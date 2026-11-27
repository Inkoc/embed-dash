# Bundled media and their rights

Everything the app ships besides code. Nothing here is loaded from a third-party host at runtime. Total bundled media: about 135 KB of fonts and icons, well under the 50 MB budget. Checked on 27 November 2026.

## Fonts

Self-hosted from `apps/web/public/fonts/`, Latin subsets, byte-identical to the Fontsource 5.3.0 npm packages (`@fontsource-variable/*`), which repackage the Google Fonts releases. Each licence file sits next to its font and ships with the build.

| File | Family | Used for | Size | Licence | Source |
|---|---|---|---|---|---|
| `atkinson-hyperlegible-next-latin-wght-normal.woff2` | Atkinson Hyperlegible Next (variable) | All app text | 34.0 KB | SIL OFL 1.1 (`OFL-AtkinsonHyperlegibleNext.txt`) | Braille Institute of America, via [Fontsource](https://fontsource.org/fonts/atkinson-hyperlegible-next) |
| `atkinson-hyperlegible-mono-latin-wght-normal.woff2` | Atkinson Hyperlegible Mono (variable) | Counts, IDs, widths, key caps | 17.8 KB | SIL OFL 1.1 (`OFL-AtkinsonHyperlegibleMono.txt`) | Braille Institute of America, via [Fontsource](https://fontsource.org/fonts/atkinson-hyperlegible-mono) |
| `noto-sans-latin-wght-normal.woff2` | Noto Sans (variable) | The Discord preview | 35.8 KB | SIL OFL 1.1 (`OFL-NotoSans.txt`) | The Noto Project Authors, via [Fontsource](https://fontsource.org/fonts/noto-sans) |
| `noto-sans-latin-wght-italic.woff2` | Noto Sans Italic (variable) | The Discord preview | 39.5 KB | SIL OFL 1.1 (`OFL-NotoSans.txt`) | The Noto Project Authors, via [Fontsource](https://fontsource.org/fonts/noto-sans) |

Noto Sans stands in for Discord's proprietary typeface in the preview; Discord itself lists Noto Sans as its first fallback. No Discord font is bundled.

## Icons

| Asset | Used for | Licence | Source |
|---|---|---|---|
| Lucide icons (`lucide-react` 1.80.0, only the icons imported are bundled) | All interface icons | ISC; a few icons derive from Feather (MIT). Notice in `apps/web/public/licenses/lucide-LICENSE.txt` | [lucide.dev](https://lucide.dev), [npm](https://www.npmjs.com/package/lucide-react) |
| `apps/web/public/icon.svg` (copy of `assets/icon.svg`) | Brand mark and favicon | Project asset, AGPL-3.0 with the code | Created for embed-dash |

No Discord logos or marks are used anywhere. The blurple "APP" tag in the preview is a coloured text label that Discord shows on bot messages, reproduced for accuracy.

## Example art

`apps/web/public/examples/*.svg` (about 2 KB in total) are generated vector illustrations for the composer's illustrative example draft (an invented game community). They were drawn for this project as SVG code and carry no third-party rights; licensed with the code under AGPL-3.0.
