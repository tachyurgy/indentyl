/**
 * Performance guard.
 *
 * Asserts the property that matters — the cost of an update is bounded by the
 * viewport, not the file — rather than an absolute millisecond figure, which
 * would be flaky on a loaded machine. The absolute numbers are produced by
 * `npm run bench`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderWindows } from '../render';
import { computeWindows } from '../window';
import { blockDelimitersFor, scanLines } from '../skip';
import { makeLines } from './fixtures';

const OPTIONS = {
  tabSize: 4,
  insertSpaces: true,
  detectErrors: true,
  maxIndentColumns: 256,
  paletteSize: 4,
  colorEmptyLines: false,
  maxDecorations: 20000,
};

function timeUpdates(lines: string[], updates: number): { mean: number; p95: number; max: number } {
  const get = (i: number) => lines[i]!;
  const step = Math.max(1, Math.floor(lines.length / updates));
  const samples: number[] = [];
  for (let top = 0; top + 45 < lines.length && samples.length < updates; top += step) {
    const windows = computeWindows([{ start: top, end: top + 45 }], 200, lines.length);
    const started = process.hrtime.bigint();
    renderWindows(get, lines.length, windows, OPTIONS);
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    p95: sorted[Math.floor(sorted.length * 0.95)]!,
    max: Math.max(...samples),
  };
}

test('a 10,000-line file updates in well under a frame', () => {
  const stats = timeUpdates(makeLines(10_000, 'spaces'), 200);
  assert.ok(stats.p95 < 20, `p95 was ${stats.p95.toFixed(3)}ms`);
  console.log(
    `      10k lines: mean ${stats.mean.toFixed(3)}ms, p95 ${stats.p95.toFixed(3)}ms, max ${stats.max.toFixed(3)}ms`,
  );
});

test('a 100,000-line file costs the same per update as a 10,000-line one', () => {
  const small = timeUpdates(makeLines(10_000, 'spaces'), 200);
  const large = timeUpdates(makeLines(100_000, 'spaces'), 200);
  console.log(
    `      100k lines: mean ${large.mean.toFixed(3)}ms, p95 ${large.p95.toFixed(3)}ms, max ${large.max.toFixed(3)}ms`,
  );
  // Ten times the file for no more than four times the work is a generous
  // ceiling on a machine that may be busy; the real ratio is about one.
  assert.ok(
    large.mean < Math.max(small.mean * 4, 1),
    `10k mean ${small.mean.toFixed(3)}ms vs 100k mean ${large.mean.toFixed(3)}ms`,
  );
  assert.ok(large.p95 < 20, `p95 was ${large.p95.toFixed(3)}ms`);
});

test('a file of mixed tabs and spaces does not fall off a cliff', () => {
  const stats = timeUpdates(makeLines(100_000, 'mixed'), 200);
  console.log(
    `      100k lines (mixed): mean ${stats.mean.toFixed(3)}ms, p95 ${stats.p95.toFixed(3)}ms`,
  );
  assert.ok(stats.p95 < 20, `p95 was ${stats.p95.toFixed(3)}ms`);
});

test('the block-comment scan over a 100,000-line file stays inside one frame', () => {
  const lines = makeLines(100_000, 'spaces');
  const started = process.hrtime.bigint();
  scanLines((i) => lines[i]!, 0, lines.length - 1, blockDelimitersFor('typescript'), { open: undefined });
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`      block scan, ${lines.length} lines: ${elapsed.toFixed(1)}ms`);
  assert.ok(elapsed < 150, `block scan took ${elapsed.toFixed(1)}ms`);
});

test('the decoration cap bounds the worst case even with no windowing', () => {
  const lines = makeLines(100_000, 'spaces');
  const started = process.hrtime.bigint();
  const result = renderWindows((i) => lines[i]!, lines.length, [{ start: 0, end: lines.length - 1 }], OPTIONS);
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(result.capped, true);
  assert.equal(result.count, 20000);
  assert.ok(elapsed < 150, `capped whole-document render took ${elapsed.toFixed(1)}ms`);
});
