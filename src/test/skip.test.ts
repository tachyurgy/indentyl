import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockDelimitersFor, computeBlockRegions, scanLines } from '../skip';

const C = blockDelimitersFor('typescript');
const PY = blockDelimitersFor('python');

test('the interior and the closing line are marked; the opening line is not', () => {
  // The opening line carries code indentation. The closing line does not: in a
  // doc block it is aligned as prose, and flagging it is the classic false
  // positive this rule exists to avoid.
  const lines = ['const a = 1;', '/* first', '   second', '   third', '*/', 'const b = 2;'];
  assert.deepEqual(computeBlockRegions(lines, C, 10000), [false, false, true, true, true, false]);
});

test('a JSDoc block does not produce a false error on its closing line', () => {
  const lines = ['/**', ' * text', ' */', '  code();'];
  assert.deepEqual(computeBlockRegions(lines, C, 10000), [false, true, true, false]);
});

test('a single-line block comment marks nothing', () => {
  assert.deepEqual(computeBlockRegions(['a /* x */ b', 'c'], C, 10000), [false, false]);
});

test('a comment that closes and reopens on one line stays open', () => {
  const lines = ['*/ code /*', 'inside', '*/'];
  const result = scanLines((i) => lines[i]!, 0, 2, C, { open: C[0] });
  assert.deepEqual(result.inside, [true, true, true]);
});

test('python docstrings are tracked', () => {
  const lines = ['def f():', '    """', '    doc', '    """', '    return 1'];
  assert.deepEqual(computeBlockRegions(lines, PY, 10000), [false, false, true, true, false]);
});

test('a one-line python docstring marks nothing', () => {
  assert.deepEqual(computeBlockRegions(['def f():', '    """doc"""', '    pass'], PY, 10000), [
    false, false, false,
  ]);
});

test('an unterminated block marks every line after it', () => {
  assert.deepEqual(computeBlockRegions(['/*', 'a', 'b'], C, 10000), [false, true, true]);
});

test('a language with no block delimiters marks nothing', () => {
  assert.deepEqual(blockDelimitersFor('shellscript'), []);
  assert.deepEqual(computeBlockRegions(['/*', 'a'], blockDelimitersFor('shellscript'), 10000), [
    false, false,
  ]);
});

test('scanning is skipped entirely above the line budget', () => {
  const lines = ['/*', 'a', 'b'];
  assert.deepEqual(computeBlockRegions(lines, C, 2), [false, false, false]);
});

test('scanning resumes correctly from a saved state', () => {
  const lines = ['/* one', 'two', 'three', '*/', 'four'];
  const first = scanLines((i) => lines[i]!, 0, 1, C, { open: undefined });
  assert.deepEqual(first.inside, [false, true]);
  const second = scanLines((i) => lines[i]!, 2, 4, C, first.state);
  assert.deepEqual(second.inside, [true, true, false]);
  // The resumed scan must agree with a scan of the whole document.
  assert.deepEqual([...first.inside, ...second.inside], computeBlockRegions(lines, C, 10000));
});

test('html comments are recognised for markup languages', () => {
  const lines = ['<p>', '<!-- note', 'more', '-->', '</p>'];
  assert.deepEqual(computeBlockRegions(lines, blockDelimitersFor('html'), 10000), [
    false, false, true, true, false,
  ]);
});
