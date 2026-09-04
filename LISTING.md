# Marketplace listing — Indentyl

## Identity
- **Extension ID:** `levelbrook.indentyl`
- **Publisher:** `levelbrook`
- **Display name:** `Indentyl — Indent Guides`
- **Version:** 1.0.0
- **Pricing:** Free. MIT. No Pro tier, ever.

**Name availability, checked 2026-09-03** against the VS Code Marketplace `extensionquery` API:
a search for `indentyl` returns **zero extensions**. The name is clear on both the Marketplace and
Open VSX, so no alternative was needed. (The same search for `indent rainbow` returns eight,
led by `oderwat.indent-rainbow` at 13,186,280 installs — the space is crowded with clones, which is
exactly why the name needed to be distinct rather than a variation on the incumbent's.)

## Short description (≤200 chars)
> Colourised indent guides that keep working. Uses your file's real tab size, diagnoses mixed tabs
> and spaces, and updates in 0.5 ms inside a 12,000-line file. No telemetry.

(178 characters.)

## Categories
`Other`, `Visualization`, `Formatters`

## Keywords / search terms
`indent`, `indentation`, `indent rainbow`, `indent guides`, `rainbow indent`, `whitespace`,
`tabs`, `spaces`, `mixed indentation`, `readability`, `colorize`, `guides`, `no telemetry`

Chosen against the long-tail queries in the incumbent's reviews and issues: "indent rainbow not
working", "indent rainbow stopped working", "indent rainbow slow large file", "indent rainbow
tabs", "indent rainbow everything is red".

## Gallery banner
`#12161F`, dark theme.

## Icon
`images/icon.png`, 128×128 PNG. Four indent levels in the default palette, with code bars, on the
portfolio's navy plate.

## Marketplace body
The README is the listing body verbatim — see `README.md`. Structure, in order:
1. One-line promise.
2. The incumbent's own review quote, and the resulting positioning: reliability, not features.
3. **"What correct means here"** — the four correctness claims, each with the specific mechanism.
4. **The large-file benchmark table.** Real measured numbers with the method stated, plus the
   whole-document comparison. This is the strongest single element on the page.
5. No-telemetry, with the test that proves it.
6. Settings table.
7. Migration paragraph for indent-rainbow settings.
8. Startup cost, free-permanently pledge, license.

## Trademark note
"indent-rainbow" and `oderwat.indent-rainbow` appear only in the body, only as factual statements
about settings compatibility and install counts. They are not in the display name or the icon.
