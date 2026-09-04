/**
 * Indent analysis.
 *
 * Pure: no `vscode`, no I/O. Everything the analysis needs about the editor —
 * above all the file's *actual* tab size and indent style — is passed in, which
 * is both what makes it testable and what makes it correct. Deciding indent
 * width from a global setting rather than the resolved per-editor value is the
 * root cause of "it colours everything as an error" reports.
 */

export type SpanKind = 'level' | 'error' | 'tabmix';

export interface IndentSpan {
  /** Character offset in the line where this span starts. */
  start: number;
  /** Character offset in the line where this span ends, exclusive. */
  end: number;
  kind: SpanKind;
  /** Indent depth, used to index the palette. Meaningless for error spans. */
  level: number;
}

export interface IndentOptions {
  /** The editor's resolved tab size. Never a guess, never a global default. */
  tabSize: number;
  /** The editor's resolved indent style. True when the file indents with spaces. */
  insertSpaces: boolean;
  /** Report indentation that disagrees with the indent style. */
  detectErrors: boolean;
  /** Stop analysing after this many characters of leading whitespace. */
  maxIndentColumns: number;
}

const TAB = 9;
const SPACE = 32;

/** Length of the leading run of spaces and tabs, capped. */
export function leadingWhitespaceLength(text: string, cap: number): number {
  const limit = Math.min(text.length, cap);
  let i = 0;
  while (i < limit) {
    const code = text.charCodeAt(i);
    if (code !== SPACE && code !== TAB) {
      break;
    }
    i++;
  }
  return i;
}

/** True when the line has no content at all beyond whitespace. */
export function isBlank(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code !== SPACE && code !== TAB && code !== 13) {
      return false;
    }
  }
  return true;
}

/**
 * Visual width of a leading-whitespace run, expanding tabs to the next tab stop.
 * This is the only correct way to compare a tab-indented line with a
 * space-indented one, and it is why `tabSize` has to be the real value.
 */
export function visualWidth(text: string, upTo: number, tabSize: number): number {
  let column = 0;
  for (let i = 0; i < upTo; i++) {
    if (text.charCodeAt(i) === TAB) {
      column = (Math.floor(column / tabSize) + 1) * tabSize;
    } else {
      column++;
    }
  }
  return column;
}

/**
 * Break one line's indentation into coloured spans.
 *
 * The walk is done in *visual columns*, so a tab and `tabSize` spaces produce
 * the same span boundaries, and a file that mixes them still lines up.
 *
 * Three things are reported as problems, and only when `detectErrors` is on:
 *
 *  - a tab in the indentation of a space-indented file;
 *  - a space before a tab in a tab-indented file (a space *after* the last tab
 *    is alignment padding, which is idiomatic and correct, so it is left alone);
 *  - a final partial unit, i.e. an indent that is not a whole number of indent
 *    units. This is the case that misfires constantly when the tab size is
 *    guessed rather than read from the editor.
 */
export function analyzeLine(text: string, options: IndentOptions): IndentSpan[] {
  const tabSize = Math.max(1, Math.floor(options.tabSize));
  const indentEnd = leadingWhitespaceLength(text, options.maxIndentColumns);
  if (indentEnd === 0) {
    return [];
  }

  const spans: IndentSpan[] = [];
  let column = 0;
  let spanStartChar = 0;
  let spanStartColumn = 0;
  let sawTab = false;
  let mixed = false;

  for (let i = 0; i < indentEnd; i++) {
    const isTab = text.charCodeAt(i) === TAB;
    if (isTab) {
      if (options.insertSpaces) {
        mixed = true;
      }
      sawTab = true;
      column = (Math.floor(column / tabSize) + 1) * tabSize;
    } else {
      if (!options.insertSpaces && !sawTab) {
        // A space before any tab in a tab-indented file is real indentation
        // expressed the wrong way. A space after the last tab is alignment.
        mixed = true;
      }
      column++;
    }

    // A boundary closes the current span. Tabs land exactly on a tab stop, so
    // this is reached at the same visual columns for tabs and for spaces.
    if (column - spanStartColumn >= tabSize) {
      spans.push({
        start: spanStartChar,
        end: i + 1,
        kind: 'level',
        level: Math.floor(spanStartColumn / tabSize),
      });
      spanStartChar = i + 1;
      spanStartColumn = column;
    }
  }

  // Anything left over is a partial indent unit.
  if (spanStartChar < indentEnd) {
    spans.push({
      start: spanStartChar,
      end: indentEnd,
      kind: options.detectErrors ? 'error' : 'level',
      level: Math.floor(spanStartColumn / tabSize),
    });
  }

  if (mixed && options.detectErrors) {
    // Repaint the whole indent as a tab/space conflict. Marking only the
    // offending character reads as a rendering glitch; marking the run reads as
    // a diagnosis, which is what it is.
    return [{ start: 0, end: indentEnd, kind: 'tabmix', level: 0 }];
  }
  return spans;
}

/**
 * The indentation a blank line inherits.
 *
 * A blank line has no indentation of its own, so to carry the guides across it
 * we take the *smaller* of the two surrounding indents. Taking the larger draws
 * a guide into a block the blank line is not part of, which is the thing that
 * looks wrong at the end of a function.
 */
export function inheritedIndentWidth(
  above: number | undefined,
  below: number | undefined,
): number {
  if (above === undefined) {
    return below ?? 0;
  }
  if (below === undefined) {
    return above;
  }
  return Math.min(above, below);
}

/** Spans for a blank line rendered at a given visual width. Always spaces. */
export function spansForWidth(width: number, tabSize: number): IndentSpan[] {
  const size = Math.max(1, Math.floor(tabSize));
  const spans: IndentSpan[] = [];
  const units = Math.floor(width / size);
  for (let level = 0; level < units; level++) {
    spans.push({ start: level * size, end: (level + 1) * size, kind: 'level', level });
  }
  return spans;
}
