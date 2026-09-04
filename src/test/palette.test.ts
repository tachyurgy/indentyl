import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOpacity, compilePatterns, resolvePalette, type PaletteInput } from '../palette';

const input: PaletteInput = {
  colors: ['rgba(1,2,3,0.5)', '#ff0000'],
  colorsLight: [],
  colorsDark: [],
  colorsHighContrast: ['rgba(9,9,9,0.9)'],
  errorColor: 'rgba(228,87,46,0.4)',
  tabmixColor: '#e6b42880',
  opacity: 1,
};

test('opacity of 1 leaves every colour untouched', () => {
  assert.equal(applyOpacity('rgba(1,2,3,0.5)', 1), 'rgba(1,2,3,0.5)');
  assert.equal(applyOpacity('#abc', 1), '#abc');
});

test('opacity scales the alpha of an rgba colour', () => {
  assert.equal(applyOpacity('rgba(1,2,3,0.5)', 0.5), 'rgba(1,2,3,0.25)');
});

test('opacity turns an opaque rgb colour into a translucent one', () => {
  assert.equal(applyOpacity('rgb(10, 20, 30)', 0.25), 'rgba(10,20,30,0.25)');
});

test('opacity converts hex colours of every length', () => {
  assert.equal(applyOpacity('#f00', 0.5), 'rgba(255,0,0,0.5)');
  assert.equal(applyOpacity('#ff0000', 0.5), 'rgba(255,0,0,0.5)');
  assert.equal(applyOpacity('#ff000080', 0.5), 'rgba(255,0,0,0.251)');
  assert.equal(applyOpacity('#f008', 0.5), 'rgba(255,0,0,0.267)');
});

test('a colour we do not understand is returned untouched rather than corrupted', () => {
  assert.equal(applyOpacity('editorIndentGuide.background', 0.5), 'editorIndentGuide.background');
  assert.equal(applyOpacity('rebeccapurple', 0.5), 'rebeccapurple');
  assert.equal(applyOpacity('#12345', 0.5), '#12345');
});

test('opacity is clamped to the 0..1 range', () => {
  assert.equal(applyOpacity('rgba(1,2,3,1)', 5), 'rgba(1,2,3,1)');
  assert.equal(applyOpacity('rgba(1,2,3,1)', -2), 'rgba(1,2,3,0)');
});

test('the generic palette is used when no theme-specific one is set', () => {
  assert.deepEqual(resolvePalette(input, 'dark').levels, input.colors);
  assert.deepEqual(resolvePalette(input, 'light').levels, input.colors);
});

test('a theme-specific palette overrides the generic one', () => {
  assert.deepEqual(resolvePalette(input, 'highContrast').levels, ['rgba(9,9,9,0.9)']);
  assert.deepEqual(
    resolvePalette({ ...input, colorsDark: ['#111'] }, 'dark').levels,
    ['#111'],
  );
  assert.deepEqual(
    resolvePalette({ ...input, colorsLight: ['#eee'] }, 'light').levels,
    ['#eee'],
  );
});

test('high-contrast light uses the high-contrast palette', () => {
  assert.deepEqual(resolvePalette(input, 'highContrastLight').levels, ['rgba(9,9,9,0.9)']);
});

test('an empty palette falls back to the built-in one rather than rendering nothing', () => {
  const palette = resolvePalette({ ...input, colors: [], colorsHighContrast: [] }, 'dark');
  assert.equal(palette.levels.length, 4);
});

test('opacity is applied to the error and tabmix colours too', () => {
  const palette = resolvePalette({ ...input, opacity: 0.5 }, 'dark');
  assert.equal(palette.error, 'rgba(228,87,46,0.2)');
  assert.equal(palette.levels[0], 'rgba(1,2,3,0.25)');
});

test('an invalid ignore pattern is dropped instead of breaking the extension', () => {
  const compiled = compilePatterns(['^\\s*//', '([unclosed', '^#']);
  assert.equal(compiled.length, 2);
  assert.equal(compiled[0]!.test('  // hi'), true);
});
