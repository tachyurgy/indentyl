# Marketing — Indentyl

## The one-line hook
**"The most popular indent-colouring extension has 13.2 million installs and has not been updated
since April 2022. Its top complaint is not a missing feature — it is that the extension stops
working. Indentyl is the same idea, built for reliability."**

## The three strongest proof points
1. **13,184,834 installs, last updated 2022-04-09.** Verified against the Marketplace
   `extensionquery` API on 2026-09-03: 13,186,280 installs at the time of checking. Four and a half
   years without a release, on a tool millions of people look at all day.
2. **The complaint is reliability, in the users' own words.** Representative review, 2022-10-02:
   *"terrible. Worked the first time I installed it. Hasn't worked since... it seems it just decided
   to stop working everywhere except linux."* That is not a feature request. It is an opening.
3. **We have the numbers, and the method.** Inside a real VS Code 1.136.1, a 12,001-line file
   scrolled top to bottom: **mean 0.558 ms per update, p95 0.806 ms, 437 of 12,001 lines scanned**.
   On synthetic files the cost is flat from 10,910 to 109,091 lines (0.115 ms to 0.094 ms mean),
   while the whole-document approach it replaces costs **55.1 ms and 399,996 decorations** at
   109,091 lines, on every keystroke. `npm run test:integration` and `npm run bench` reproduce both.

## Show HN

**Title:** `Show HN: Indentyl – indent guides that cost 0.5ms per update in a 12k-line file`

**Body:**

> The most-installed indent-colouring extension for VS Code has 13.2M installs and its last release
> was April 2022. Its reviews are not asking for features; they are saying it stopped working. I
> rebuilt it around the two things that actually break.
>
> The first is indent width. It has to come from the editor's *resolved* tabSize and insertSpaces —
> the value VS Code arrives at after detectIndentation, .editorconfig, the language override and the
> workspace setting have all had their say. Read a global default instead and a normal two-space
> file is coloured entirely as an error, which is the "everything is red" report. Tabs and spaces
> then have to be compared in visual columns, so a tab advances to the next tab stop rather than by
> a fixed width, and a file that mixes them still lines up. A space *after* the last tab is
> alignment padding and must not be flagged; a space *before* a tab must be. Getting that pair
> backwards makes the extension unusable in a Go project.
>
> The second is the render loop. Decorating the whole document on every keystroke costs 55ms and
> 400,000 decoration ranges on a 109k-line file. Indentyl decorates the visible ranges plus a
> 200-line margin, merges overlapping windows so a folded region is not decorated twice, and
> debounces. Measured inside a real VS Code 1.136.1 on a 12,001-line file scrolled top to bottom:
> mean 0.558ms per update, p95 0.806ms, max 0.871ms, 437 of 12,001 lines scanned each time. On
> synthetic documents the cost is flat from 10,910 lines (0.115ms mean) to 109,091 lines (0.094ms
> mean). The number does not move, which is the property you want.
>
> Block comments get one more pass: level colours still draw inside them, but indent *errors* are
> suppressed, because the alignment in a doc comment is prose. That includes the closing ` */`,
> whose one-space indent is the most common false positive in this category.
>
> No telemetry — the shipped bundle's entire require list is ["vscode"], and there is a test that
> reads the built file and fails if that changes. MIT, free, no Pro tier. 76 unit tests plus 20 integration tests against a real VS Code host.

**Why this title works:** it is a number, and the number is the product. HN will argue about the
benchmark method, which is a good argument to be having, and the method is stated in the README.

## r/vscode post

**Title:** `indent-rainbow hasn't been updated since 2022 — I built a replacement focused on it not breaking`

Lead with the 2022 review quote, then the "everything is red" explanation (resolved tab size), then
the benchmark table. Mention that the settings names carry over. Disclose authorship in the first
line. Post Tue–Thu, 8–10am ET.

Then, one per week and never stacked: r/programming, r/Python (indentation is load-bearing there),
r/golang (tabs).

## The orphaned-issue lane
`oderwat/vscode-indent-rainbow` has open issues about the extension silently not rendering, about
tab-indented files being flagged wholesale, and about performance on large files. Those are the
three things Indentyl specifically fixed and specifically tests. Reply only where we genuinely
fixed the reported bug, once, with the commit and the test name. Never mass-post.

## Content / SEO
- "Why your indent highlighter thinks your whole file is wrong" — the resolved-tabSize explanation.
  This is the page that gets cited.
- "indent-rainbow alternatives in 2026"
- "How VS Code decides your file's indentation" — reference content, earns links forever

## Cross-sell
Exactly one command-palette entry, `Indentyl: More Levelbrook Tools`, opening a local page. No
popup, no notification, no status-bar advert, no first-run interstitial. Indentyl is top of the
funnel for the paid products; being trusted is the entire job.
