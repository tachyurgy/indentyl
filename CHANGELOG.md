# Changelog

All notable changes to Indentyl are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-09-03

First release.

### Added
- Colourised indentation guides with a configurable palette, opacity, and a `background` or
  `leftBorder` style.
- Indent width taken from the editor's **resolved** `tabSize` and `insertSpaces`, so
  `editor.detectIndentation`, `.editorconfig` and per-language overrides are all honoured.
- Tab and space indentation compared by visual column, so a tab and a full indent of spaces
  produce the same guide boundaries.
- Error highlighting for indents that are not a whole number of indent units, and separate
  highlighting for tabs and spaces mixed against the file's own indent style. Alignment padding
  after a tab is correctly not flagged.
- Block comment and docstring tracking for 30 languages, so indent errors are suppressed inside
  comment bodies — including the closing delimiter line of a doc block.
- Per-theme palettes for light, dark and high-contrast themes, rebuilt when the theme changes.
- Visible-range windowing with a configurable margin: update cost is bounded by the viewport, not
  the file. Measured inside a real VS Code 1.136.1 at 0.558 ms mean per update on a 12,001-line file, and
  flat at 0.094-0.115 ms mean on synthetic files from 10,910 to 109,091 lines.
- Debounced updates, a per-line indent analysis cap, and a hard cap on decorations per update.
- Language include and exclude lists, and regex line-ignore patterns.
- Optional guide continuation across blank lines, inheriting the smaller of the two surrounding
  indents.
- Toggle and Refresh commands; Refresh reports lines scanned, decorations applied and elapsed time.
- A single command-palette entry listing the other Levelbrook extensions.

### Notes
- Activates on `onStartupFinished`, never `*`.
- No telemetry, no network access. The build fails if the shipped bundle requires anything other
  than `vscode`.
