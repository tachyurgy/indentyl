import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderWindows, type RenderOptions } from '../render';
import { computeWindows } from '../window';
import { computeBlockRegions, blockDelimitersFor } from '../skip';
import { makeLines, makeCommentedLines } from './fixtures';

function options(overrides: Partial<RenderOptions> = {}): RenderOptions {
  return {
    tabSize: 4,
    insertSpaces: true,
    detectErrors: true,
    maxIndentColumns: 256,
    paletteSize: 4,
    colorEmptyLines: false,
    maxDecorations: 100000,
    ...overrides,
  };
}

const from = (lines: readonly string[]) => (i: number) => lines[i] ?? '';

test('only the windowed lines are scanned, not the whole document', () => {
  const lines = makeLines(10000, 'spaces');
  const windows = computeWindows([{ start: 5000, end: 5040 }], 200, lines.length);
  const result = renderWindows(from(lines), lines.length, windows, options());
  assert.equal(result.linesScanned, 441);
  assert.ok(result.linesScanned < lines.length / 20);
});

test('scanning cost does not grow with the size of the file', () => {
  const small = makeLines(1000, 'spaces');
  const large = makeLines(200000, 'spaces');
  const view = { start: 500, end: 540 };
  const a = renderWindows(from(small), small.length, computeWindows([view], 200, small.length), options());
  const b = renderWindows(from(large), large.length, computeWindows([view], 200, large.length), options());
  assert.equal(a.linesScanned, b.linesScanned);
});

test('levels cycle through the palette', () => {
  const lines = ['                    x'];
  const result = renderWindows(from(lines), 1, [{ start: 0, end: 0 }], options({ paletteSize: 4 }));
  // Five indent units over a palette of four: levels 0,1,2,3 then 0 again.
  assert.deepEqual(result.levels.map((bucket) => bucket.length), [2, 1, 1, 1]);
  assert.equal(result.count, 5);
});

test('a tab in a space-indented file lands in the tabmix bucket', () => {
  const lines = ['    \tx'];
  const result = renderWindows(from(lines), 1, [{ start: 0, end: 0 }], options());
  assert.equal(result.tabmix.length, 1);
  assert.equal(result.error.length, 0);
});

test('a ragged indent lands in the error bucket', () => {
  const lines = ['      x'];
  const result = renderWindows(from(lines), 1, [{ start: 0, end: 0 }], options());
  assert.equal(result.error.length, 1);
  assert.equal(result.levels[0]!.length, 1);
});

test('errors inside a block comment are demoted to level colours', () => {
  const lines = ['/**', ' * text', ' */', '  code();'];
  const inside = computeBlockRegions(lines, blockDelimitersFor('typescript'), 100000);
  const withSkip = renderWindows(from(lines), lines.length, [{ start: 0, end: 3 }], options({
    isInsideBlock: (line) => inside[line] === true,
  }));
  const withoutSkip = renderWindows(from(lines), lines.length, [{ start: 0, end: 3 }], options());
  // ' * text' is a one-space indent, which is ragged. Inside a comment that is
  // prose alignment, not a mistake.
  assert.equal(withoutSkip.error.length, 3);
  assert.equal(withSkip.error.length, 1, 'only the real code line should be flagged');
});

test('an ignored line pattern removes all decoration for that line', () => {
  const lines = ['    a();', '    // b();', '    c();'];
  const result = renderWindows(from(lines), 3, [{ start: 0, end: 2 }], options({
    ignoreLinePatterns: [/^\s*\/\//],
  }));
  assert.equal(result.count, 2);
});

test('blank lines are skipped by default and inherited when asked for', () => {
  const lines = ['        a();', '', '        b();'];
  const off = renderWindows(from(lines), 3, [{ start: 0, end: 2 }], options());
  assert.equal(off.count, 4);
  const on = renderWindows(from(lines), 3, [{ start: 0, end: 2 }], options({ colorEmptyLines: true }));
  assert.equal(on.count, 6);
});

test('a blank line inherits the smaller neighbouring indent, not the larger', () => {
  const lines = ['            deep();', '', '    shallow();'];
  const result = renderWindows(from(lines), 3, [{ start: 0, end: 2 }], options({ colorEmptyLines: true }));
  const blank = [...result.levels.flat()].filter((span) => span.line === 1);
  assert.equal(blank.length, 1, 'the blank line should inherit one level, not three');
});

test('the decoration cap stops the build and is reported', () => {
  const lines = makeLines(5000, 'spaces');
  const result = renderWindows(from(lines), lines.length, [{ start: 0, end: lines.length - 1 }], options({
    maxDecorations: 100,
  }));
  assert.equal(result.capped, true);
  assert.equal(result.count, 100);
});

test('the cap is not hit for a normal viewport', () => {
  const lines = makeLines(10000, 'spaces');
  const windows = computeWindows([{ start: 4000, end: 4060 }], 200, lines.length);
  const result = renderWindows(from(lines), lines.length, windows, options({ maxDecorations: 20000 }));
  assert.equal(result.capped, false);
  assert.ok(result.count < 20000, `${result.count} decorations for a 461-line window`);
});

test('a tab-indented file with the right indent style produces no errors at all', () => {
  const lines = makeLines(500, 'tabs');
  const result = renderWindows(from(lines), lines.length, [{ start: 0, end: 499 }], options({
    insertSpaces: false,
  }));
  assert.equal(result.error.length, 0);
  assert.equal(result.tabmix.length, 0);
  assert.ok(result.count > 0);
});

test('the same tab-indented file read as space-indented is flagged, which is the point', () => {
  const lines = makeLines(500, 'tabs');
  const result = renderWindows(from(lines), lines.length, [{ start: 0, end: 499 }], options({
    insertSpaces: true,
  }));
  assert.ok(result.tabmix.length > 0);
});

test('a document of commented code renders without error spans on the comment bodies', () => {
  const lines = makeCommentedLines(400);
  const inside = computeBlockRegions(lines, blockDelimitersFor('typescript'), 100000);
  const result = renderWindows(from(lines), lines.length, [{ start: 0, end: lines.length - 1 }], options({
    isInsideBlock: (line) => inside[line] === true,
  }));
  assert.equal(result.error.length, 0);
});

test('every emitted span is non-empty and inside its line', () => {
  const lines = makeLines(2000, 'mixed');
  const result = renderWindows(from(lines), lines.length, [{ start: 0, end: lines.length - 1 }], options());
  const all = [...result.levels.flat(), ...result.error, ...result.tabmix];
  for (const span of all) {
    assert.ok(span.end > span.start, 'empty span emitted');
    assert.ok(span.start >= 0);
    assert.ok(span.end <= lines[span.line]!.length, 'span runs past the end of its line');
  }
  assert.equal(all.length, result.count);
});

test('an out-of-range window does not read past the end of the document', () => {
  const lines = ['a();'];
  const result = renderWindows(from(lines), 1, [{ start: 0, end: 500 }], options());
  assert.equal(result.linesScanned, 1);
});
