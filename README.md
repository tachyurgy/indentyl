# Indentyl

**Colourised indentation guides that keep working.**

Each level of indentation gets its own colour, so nesting is readable at a glance and a line that
does not line up is obvious immediately.

The most-installed extension in this category has not been updated since April 2022, and its most
common complaint is not a missing feature — it is that it stops working. *"Worked the first time I
installed it. Hasn't worked since... it seems it just decided to stop working everywhere except
Linux."* So Indentyl is not built around new features. It is built around being correct on every
platform, in every theme, in files of every size.

## What "correct" means here

**It uses your file's real indentation settings.** Indentyl reads the *resolved* tab size and
indent style from the editor — the value VS Code arrived at after `editor.detectIndentation`, your
`.editorconfig`, the language override and the workspace setting have all had their say. A file
that indents with two spaces is coloured in units of two. A file that indents with tabs is coloured
by tab stop. Reading a global default instead is the reason other extensions colour a perfectly
normal file entirely red.

**Tabs and spaces are compared by visual column.** A tab advances to the next tab stop, not by a
fixed number of characters, so `\t` and four spaces produce the same guide boundaries in a
four-space file and a file that mixes them still lines up.

**Mixed indentation is diagnosed, not just flagged.**
- A tab in the indentation of a space-indented file is highlighted.
- A space *before* a tab in a tab-indented file is highlighted.
- A space *after* the last tab is alignment padding, which is idiomatic and correct, so it is left
  alone. Getting this backwards is what makes an indent highlighter unusable in a Go or Makefile
  project.
- An indent that is not a whole number of indent units is highlighted separately, in its own
  colour.

**Comment bodies are not shouted at.** Inside a block comment or a Python docstring, the level
colours are still drawn — the rhythm of the file is unbroken — but indent errors are suppressed,
because the alignment there is prose. That includes the closing ` */` of a JSDoc block, whose
one-space indent is the single most common false positive in this category.

**Every theme.** Palettes resolve per theme kind, with separate overrides for light, dark and high
contrast, and the decorations are rebuilt when you switch themes rather than staying as they were.

## Large files

Indentyl decorates the lines on screen plus a margin, and nothing else. The cost of an update is
bounded by the size of your viewport, not the size of your file.

### Measured inside a real VS Code

VS Code 1.136.1, Electron 42.10.0, darwin/arm64. A **12,001-line** TypeScript file, opened in a real
editor, scrolled from top to bottom in 300-line steps, timing each full update — window computation,
indent analysis and decoration building:

| | Value |
| --- | --- |
| Updates measured | 40 |
| **Mean update** | **0.558 ms** |
| p95 update | 0.806 ms |
| Slowest update | 0.871 ms |
| Decorations per update | 1,749 |
| Lines scanned per update | 437 of 12,001 |

437 lines out of 12,001, on every update, whatever the file size. That is the whole design.

These move by roughly ±10% with machine load; a second run of the same suite gave a 0.511 ms mean.
Call it about half a millisecond.

Reproduce it with `npm run test:integration`; the numbers are printed by the suite, and the two
assertions behind them (`mean < 25 ms`, `max < 100 ms`) fail the build if they regress.

### Scaling, measured on synthetic files

Running the same pipeline over synthetic documents shows the cost is genuinely flat as the file
grows. 45-line viewport, 200-line render margin, four colours, scrolling the whole file one viewport
at a time (`npm run bench`):

| File | Updates | Mean | p95 | Max | Lines scanned per update |
| --- | --- | --- | --- | --- | --- |
| 10,910 lines | 242 | **0.115 ms** | 0.201 ms | 1.05 ms | 442 |
| 54,546 lines | 1,212 | **0.094 ms** | 0.116 ms | 2.18 ms | 445 |
| 109,091 lines | 2,424 | **0.094 ms** | 0.114 ms | 1.37 ms | 446 |

The number does not move as the file grows, which is the point. For contrast, decorating the whole
document — the approach Indentyl avoids — takes **4.9 ms and 39,996 decorations** at 10,910 lines
and **55.1 ms and 399,996 decorations** at 109,091 lines, on every keystroke.

A file with tabs and spaces mixed throughout, which exercises the error paths, measures the same:
0.094–0.100 ms mean at every size. Block-comment tracking is a separate cached pass costing 1.0 ms
at 10,910 lines and 3.6 ms at 109,091, recomputed only when the document changes.

These synthetic figures are lower than the in-editor ones above because reading a line from an array
is cheaper than reading it from a `TextDocument`. The in-editor number is the real one; the
synthetic table is there to show the shape of the curve, which is flat.

Three further safety valves, all configurable: updates are debounced (`indentyl.updateDelayMs`,
60 ms), a single line's indentation is only analysed to `indentyl.maxIndentColumns` (256) so a
machine-generated file cannot stall an update, and no single update ever emits more than
`indentyl.maxDecorationsPerEditor` (20,000) decorations.

## No telemetry, and you can check

Indentyl makes no network requests. There is no analytics, no crash reporter, no update ping.

A test in this repository reads the compiled bundle that ships inside the `.vsix` and asserts that
its **entire `require` list is `["vscode"]`** — no `http`, no `https`, no `net`, no `dns`, no
`child_process`, no `fetch`, no `createTelemetryLogger`. Run `npm test` and watch it check.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `indentyl.colors` | four translucent hues | Colours cycled across indent levels |
| `indentyl.colorsLight` / `colorsDark` / `colorsHighContrast` | — | Per-theme overrides |
| `indentyl.opacity` | `1` | Multiplies the alpha of every colour |
| `indentyl.style` | `background` | `background` fills the unit, `leftBorder` draws a thin rule |
| `indentyl.errorColor` | vermilion | Indent that is not a whole number of units |
| `indentyl.tabmixColor` | amber | Tabs and spaces mixed against the file's style |
| `indentyl.detectErrors` | `true` | Turn error highlighting off entirely |
| `indentyl.ignoreErrorLanguages` | `markdown, plaintext, log, diff` | `*` disables errors everywhere |
| `indentyl.ignoreErrorsInBlockComments` | `true` | No errors inside comments and docstrings |
| `indentyl.ignoreLinePatterns` | `[]` | Regexes for lines to leave undecorated |
| `indentyl.includedLanguages` / `excludedLanguages` | `[]` | Restrict where it runs |
| `indentyl.colorEmptyLines` | `false` | Carry guides across blank lines |
| `indentyl.renderMarginLines` | `200` | Lines decorated beyond the viewport |
| `indentyl.updateDelayMs` | `60` | Debounce after an edit or scroll |
| `indentyl.enabled` | `true` | Master switch, per workspace |

`Indentyl: Toggle Indent Colouring` turns it off and on for the session.
`Indentyl: Refresh Decorations` redraws immediately and reports lines scanned, decorations applied
and elapsed time in the status bar — so you can check the numbers above on your own machine and your
own files rather than taking them on trust.

## Coming from indent-rainbow

`indentyl.colors`, `indentyl.errorColor`, `indentyl.tabmixColor`, `indentyl.ignoreLinePatterns`,
`indentyl.ignoreErrorLanguages`, `indentyl.includedLanguages` and `indentyl.excludedLanguages` take
the same values as their `indent-rainbow.*` counterparts, so a settings block copies over. There
is no `indentSetter`-style guessing to configure: the indent width comes from the editor.

## Startup cost

Indentyl activates on `onStartupFinished`, never on `*`, so it does nothing at all until VS Code
has finished starting.

## Free, permanently

MIT licensed and free. No Pro tier, no license key, no trial, no upgrade prompt, and no plan to
add one.

## License

MIT © Levelbrook Consulting
