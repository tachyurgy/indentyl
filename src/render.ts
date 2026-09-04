/**
 * Building the decoration list.
 *
 * Pure and `vscode`-free so it can be unit-tested and benchmarked directly: the
 * benchmark in `src/test/bench.ts` drives this exact function over a synthetic
 * 10,000-line file. The controller turns the plain results into
 * `vscode.Range` objects and nothing else.
 */

import { analyzeLine, inheritedIndentWidth, isBlank, leadingWhitespaceLength, spansForWidth, visualWidth, type IndentOptions, type IndentSpan } from './analyze';
import type { LineRange } from './window';

export interface RenderOptions extends IndentOptions {
  /** Number of level colours in the palette. */
  paletteSize: number;
  /** Carry indentation across blank lines. */
  colorEmptyLines: boolean;
  /** Never emit more than this many decorations in one update. */
  maxDecorations: number;
  /** Suppress error spans on these lines (block comments and docstrings). */
  isInsideBlock?: (line: number) => boolean;
  /** Lines matching any of these get no decoration at all. */
  ignoreLinePatterns?: readonly RegExp[];
}

export interface PlacedSpan {
  line: number;
  start: number;
  end: number;
}

export interface RenderResult {
  /** One array per palette colour, plus `error` and `tabmix`. */
  levels: PlacedSpan[][];
  error: PlacedSpan[];
  tabmix: PlacedSpan[];
  /** Total spans emitted. */
  count: number;
  /** True when `maxDecorations` stopped the build early. */
  capped: boolean;
  /** Lines actually inspected. Used by the benchmark and the tests. */
  linesScanned: number;
}

function emptyResult(paletteSize: number): RenderResult {
  return {
    levels: Array.from({ length: Math.max(1, paletteSize) }, () => [] as PlacedSpan[]),
    error: [],
    tabmix: [],
    count: 0,
    capped: false,
    linesScanned: 0,
  };
}

/**
 * Find the visual indent width of the nearest non-blank line in a direction,
 * bounded so a long run of blank lines cannot turn one update into a full scan.
 */
function neighbourIndent(
  getLine: (line: number) => string,
  from: number,
  step: -1 | 1,
  lineCount: number,
  tabSize: number,
  maxIndentColumns: number,
  budget: number,
): number | undefined {
  for (let i = from + step, seen = 0; i >= 0 && i < lineCount && seen < budget; i += step, seen++) {
    const text = getLine(i);
    if (!isBlank(text)) {
      return visualWidth(text, leadingWhitespaceLength(text, maxIndentColumns), tabSize);
    }
  }
  return undefined;
}

/**
 * Build every decoration for the given windows.
 *
 * The work is strictly proportional to the number of lines in `windows`, which
 * is the viewport plus a margin. A 10,000-line file and a 10,000,000-line file
 * cost the same per update.
 */
export function renderWindows(
  getLine: (line: number) => string,
  lineCount: number,
  windows: readonly LineRange[],
  options: RenderOptions,
): RenderResult {
  const result = emptyResult(options.paletteSize);
  const paletteSize = Math.max(1, options.paletteSize);
  const patterns = options.ignoreLinePatterns ?? [];

  const push = (bucket: PlacedSpan[], span: PlacedSpan): boolean => {
    if (result.count >= options.maxDecorations) {
      result.capped = true;
      return false;
    }
    bucket.push(span);
    result.count++;
    return true;
  };

  const place = (line: number, spans: readonly IndentSpan[], allowErrors: boolean): boolean => {
    for (const span of spans) {
      if (span.start >= span.end) {
        continue;
      }
      const placed = { line, start: span.start, end: span.end };
      let bucket: PlacedSpan[];
      if (span.kind === 'tabmix') {
        bucket = allowErrors ? result.tabmix : result.levels[span.level % paletteSize]!;
      } else if (span.kind === 'error') {
        bucket = allowErrors ? result.error : result.levels[span.level % paletteSize]!;
      } else {
        bucket = result.levels[span.level % paletteSize]!;
      }
      if (!push(bucket, placed)) {
        return false;
      }
    }
    return true;
  };

  outer: for (const window of windows) {
    for (let line = window.start; line <= window.end && line < lineCount; line++) {
      const text = getLine(line);
      result.linesScanned++;

      if (patterns.length > 0 && patterns.some((pattern) => pattern.test(text))) {
        continue;
      }

      const blank = isBlank(text);
      if (blank) {
        if (!options.colorEmptyLines) {
          continue;
        }
        const width = inheritedIndentWidth(
          neighbourIndent(getLine, line, -1, lineCount, options.tabSize, options.maxIndentColumns, 200),
          neighbourIndent(getLine, line, 1, lineCount, options.tabSize, options.maxIndentColumns, 200),
        );
        // A blank line has no characters to decorate, so the guides are drawn
        // as a synthetic run the controller renders past the end of the line.
        if (!place(line, spansForWidth(width, options.tabSize), false)) {
          break outer;
        }
        continue;
      }

      const allowErrors = options.detectErrors && !(options.isInsideBlock?.(line) ?? false);
      if (!place(line, analyzeLine(text, options), allowErrors)) {
        break outer;
      }
    }
  }
  return result;
}
