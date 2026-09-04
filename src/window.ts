/**
 * Visible-range windowing.
 *
 * The incumbent this replaces decorates the whole document on every keystroke,
 * which is why it becomes unusable on large files. Indentyl only ever builds
 * decorations for the lines on screen plus a margin, so the cost of an update is
 * bounded by the size of the viewport and not by the size of the file.
 */

export interface LineRange {
  /** First line, inclusive. */
  start: number;
  /** Last line, inclusive. */
  end: number;
}

/**
 * Expand the editor's visible ranges by a margin, clamp them to the document,
 * and merge any that now overlap or abut.
 *
 * Merging matters because a folded region or a split view reports several
 * visible ranges, and overlapping windows would decorate the same lines twice.
 */
export function computeWindows(
  visible: readonly LineRange[],
  margin: number,
  lineCount: number,
): LineRange[] {
  if (lineCount <= 0) {
    return [];
  }
  const last = lineCount - 1;
  const expanded = visible
    .map((range) => ({
      start: Math.max(0, Math.min(range.start, range.end) - margin),
      end: Math.min(last, Math.max(range.start, range.end) + margin),
    }))
    .filter((range) => range.start <= last && range.end >= 0)
    .sort((a, b) => a.start - b.start);

  const merged: LineRange[] = [];
  for (const range of expanded) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** Total number of lines covered by a set of windows. */
export function windowLineCount(windows: readonly LineRange[]): number {
  return windows.reduce((total, range) => total + (range.end - range.start + 1), 0);
}
