import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeLine, inheritedIndentWidth, isBlank, leadingWhitespaceLength, spansForWidth, visualWidth,
  type IndentOptions,
} from '../analyze';

const spaces4: IndentOptions = { tabSize: 4, insertSpaces: true, detectErrors: true, maxIndentColumns: 256 };
const spaces2: IndentOptions = { ...spaces4, tabSize: 2 };
const tabs4: IndentOptions = { ...spaces4, insertSpaces: false };
const noErrors: IndentOptions = { ...spaces4, detectErrors: false };

const shape = (text: string, options: IndentOptions) =>
  analyzeLine(text, options).map((s) => `${s.kind}:${s.level}:${s.start}-${s.end}`);

test('a line with no indentation produces nothing', () => {
  assert.deepEqual(analyzeLine('const x = 1;', spaces4), []);
  assert.deepEqual(analyzeLine('', spaces4), []);
});

test('spaces split into one span per indent unit', () => {
  assert.deepEqual(shape('        x', spaces4), ['level:0:0-4', 'level:1:4-8']);
});

test('the indent unit follows the file tab size, not a global default', () => {
  // The same line, read as a 2-space file, is four levels deep, not two.
  assert.deepEqual(shape('        x', spaces2), [
    'level:0:0-2', 'level:1:2-4', 'level:2:4-6', 'level:3:6-8',
  ]);
});

test('tabs produce the same levels as the equivalent spaces', () => {
  const withTabs = analyzeLine('\t\tx', tabs4);
  assert.equal(withTabs.length, 2);
  assert.deepEqual(withTabs.map((s) => s.level), [0, 1]);
  assert.deepEqual(withTabs.map((s) => [s.start, s.end]), [[0, 1], [1, 2]]);
});

test('a tab advances to the next tab stop, not by a fixed width', () => {
  assert.equal(visualWidth('\t', 1, 4), 4);
  assert.equal(visualWidth('  \t', 3, 4), 4, 'two spaces then a tab lands on column 4');
  assert.equal(visualWidth('    \t', 5, 4), 8);
  assert.equal(visualWidth('\t \t', 3, 4), 8);
});

test('a tab in a space-indented file is reported as a tab/space conflict', () => {
  assert.deepEqual(shape('    \tx', spaces4), ['tabmix:0:0-5']);
});

test('a space before a tab in a tab-indented file is a conflict', () => {
  assert.deepEqual(shape(' \tx', tabs4), ['tabmix:0:0-2']);
});

test('spaces after the last tab are alignment padding, not a conflict', () => {
  // `\t  ` is the idiomatic "indent one level, then align two columns" form.
  const spans = analyzeLine('\t  x', tabs4);
  assert.ok(spans.every((s) => s.kind !== 'tabmix'), 'alignment padding was wrongly flagged');
});

test('a partial indent unit is reported as an error', () => {
  assert.deepEqual(shape('      x', spaces4), ['level:0:0-4', 'error:1:4-6']);
  assert.deepEqual(shape('  x', spaces4), ['error:0:0-2']);
});

test('ragged indentation of every width is handled without throwing', () => {
  for (let width = 0; width <= 33; width++) {
    const spans = analyzeLine(' '.repeat(width) + 'x', spaces4);
    const covered = spans.reduce((total, s) => total + (s.end - s.start), 0);
    assert.equal(covered, width, `width ${width} was not fully covered`);
    // Spans must be contiguous and non-overlapping.
    let cursor = 0;
    for (const span of spans) {
      assert.equal(span.start, cursor, `gap or overlap at width ${width}`);
      cursor = span.end;
    }
  }
});

test('with error detection off, a partial unit is coloured as a level', () => {
  assert.deepEqual(shape('      x', noErrors), ['level:0:0-4', 'level:1:4-6']);
  assert.deepEqual(shape('    \tx', noErrors), ['level:0:0-4', 'level:1:4-5']);
});

test('a whitespace-only line still analyses as indentation', () => {
  assert.deepEqual(shape('        ', spaces4), ['level:0:0-4', 'level:1:4-8']);
});

test('a line of only tabs and spaces mixed is fully covered', () => {
  const spans = analyzeLine('\t \t  x', tabs4);
  assert.ok(spans.length > 0);
  assert.equal(spans[0]!.start, 0);
});

test('very long indentation is capped instead of scanned to the end', () => {
  const line = ' '.repeat(100000) + 'x';
  const spans = analyzeLine(line, { ...spaces4, maxIndentColumns: 256 });
  const last = spans[spans.length - 1]!;
  assert.equal(last.end, 256, 'analysis did not stop at maxIndentColumns');
  assert.equal(spans.length, 64);
});

test('a very long line with short indentation costs nothing extra', () => {
  const line = '    ' + 'x'.repeat(2_000_000);
  const started = process.hrtime.bigint();
  const spans = analyzeLine(line, spaces4);
  const micros = Number(process.hrtime.bigint() - started) / 1000;
  assert.deepEqual(spans.map((s) => s.level), [0]);
  // Generous ceiling so a loaded machine cannot make this flaky. A regression
  // to scanning the whole line would be three orders of magnitude over it.
  assert.ok(micros < 5000, `a 2MB line took ${micros.toFixed(0)}us to analyse`);
});

test('leadingWhitespaceLength stops at the first real character and at the cap', () => {
  assert.equal(leadingWhitespaceLength('   abc', 256), 3);
  assert.equal(leadingWhitespaceLength('\t\tabc', 256), 2);
  assert.equal(leadingWhitespaceLength('abc', 256), 0);
  assert.equal(leadingWhitespaceLength('      ', 3), 3);
});

test('isBlank recognises empty, whitespace-only and carriage-return lines', () => {
  assert.equal(isBlank(''), true);
  assert.equal(isBlank('    '), true);
  assert.equal(isBlank('\t\t'), true);
  assert.equal(isBlank('  \r'), true);
  assert.equal(isBlank('  x'), false);
});

test('a blank line inherits the smaller of its two neighbours', () => {
  assert.equal(inheritedIndentWidth(8, 4), 4);
  assert.equal(inheritedIndentWidth(4, 8), 4);
  assert.equal(inheritedIndentWidth(undefined, 8), 8);
  assert.equal(inheritedIndentWidth(8, undefined), 8);
  assert.equal(inheritedIndentWidth(undefined, undefined), 0);
});

test('synthetic spans for a blank line cover whole units only', () => {
  assert.deepEqual(
    spansForWidth(10, 4).map((s) => [s.start, s.end, s.level]),
    [[0, 4, 0], [4, 8, 1]],
  );
  assert.deepEqual(spansForWidth(0, 4), []);
});

test('a tab size of zero or nonsense does not divide by zero', () => {
  const spans = analyzeLine('    x', { ...spaces4, tabSize: 0 });
  assert.ok(spans.length > 0);
  assert.ok(spans.every((s) => Number.isFinite(s.level)));
});
