import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWindows, windowLineCount } from '../window';

test('a window is the visible range expanded by the margin', () => {
  assert.deepEqual(computeWindows([{ start: 500, end: 540 }], 200, 10000), [
    { start: 300, end: 740 },
  ]);
});

test('a window is clamped to the document', () => {
  assert.deepEqual(computeWindows([{ start: 0, end: 40 }], 200, 100), [{ start: 0, end: 99 }]);
  assert.deepEqual(computeWindows([{ start: 9990, end: 9999 }], 200, 10000), [
    { start: 9790, end: 9999 },
  ]);
});

test('overlapping and abutting windows are merged, so no line is decorated twice', () => {
  assert.deepEqual(
    computeWindows([{ start: 100, end: 140 }, { start: 200, end: 240 }], 50, 10000),
    [{ start: 50, end: 290 }],
  );
});

test('windows far apart stay separate', () => {
  assert.deepEqual(
    computeWindows([{ start: 10, end: 20 }, { start: 5000, end: 5010 }], 10, 10000),
    [{ start: 0, end: 30 }, { start: 4990, end: 5020 }],
  );
});

test('folded regions arriving out of order are sorted before merging', () => {
  assert.deepEqual(
    computeWindows([{ start: 5000, end: 5010 }, { start: 10, end: 20 }], 10, 10000),
    [{ start: 0, end: 30 }, { start: 4990, end: 5020 }],
  );
});

test('a reversed range is normalised', () => {
  assert.deepEqual(computeWindows([{ start: 40, end: 10 }], 5, 10000), [{ start: 5, end: 45 }]);
});

test('an empty document yields no windows', () => {
  assert.deepEqual(computeWindows([{ start: 0, end: 0 }], 200, 0), []);
});

test('a zero margin decorates exactly the visible range', () => {
  assert.deepEqual(computeWindows([{ start: 100, end: 140 }], 0, 10000), [
    { start: 100, end: 140 },
  ]);
});

test('the window size is bounded by the viewport, not the file', () => {
  const small = windowLineCount(computeWindows([{ start: 500, end: 540 }], 200, 10_000));
  const huge = windowLineCount(computeWindows([{ start: 500, end: 540 }], 200, 10_000_000));
  assert.equal(small, huge);
  assert.equal(small, 441);
});
