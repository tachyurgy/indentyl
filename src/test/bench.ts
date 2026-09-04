/**
 * Large-file benchmark.
 *
 * Measures the analysis pipeline — window computation, block-region scanning and
 * decoration building — which is all the work Indentyl does per update. It does
 * not measure VS Code's own cost of applying decorations, which belongs to the
 * editor and is the same for any extension.
 *
 * Run with: npm run bench
 */

import { renderWindows } from '../render';
import { computeWindows } from '../window';
import { blockDelimitersFor, scanLines } from '../skip';
import { makeLines } from './fixtures';

const VIEWPORT = 45;
const MARGIN = 200;
const PALETTE = 4;

function options(overrides: Record<string, unknown> = {}) {
  return {
    tabSize: 4,
    insertSpaces: true,
    detectErrors: true,
    maxIndentColumns: 256,
    paletteSize: PALETTE,
    colorEmptyLines: false,
    maxDecorations: 20000,
    ...overrides,
  } as Parameters<typeof renderWindows>[3];
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

function ms(hr: bigint): number {
  return Number(hr) / 1e6;
}

function benchWindowed(lines: string[], label: string): void {
  const get = (i: number) => lines[i]!;
  const samples: number[] = [];
  let decorations = 0;
  let scanned = 0;

  // Simulate scrolling through the whole file, one viewport at a time.
  for (let top = 0; top + VIEWPORT < lines.length; top += VIEWPORT) {
    const windows = computeWindows([{ start: top, end: top + VIEWPORT }], MARGIN, lines.length);
    const started = process.hrtime.bigint();
    const result = renderWindows(get, lines.length, windows, options());
    samples.push(ms(process.hrtime.bigint() - started));
    decorations += result.count;
    scanned += result.linesScanned;
  }

  const total = samples.reduce((a, b) => a + b, 0);
  console.log(
    `  ${label.padEnd(34)} updates=${String(samples.length).padStart(5)}  ` +
      `mean=${(total / samples.length).toFixed(3)}ms  p95=${percentile(samples, 95).toFixed(3)}ms  ` +
      `max=${Math.max(...samples).toFixed(3)}ms  ` +
      `avg decorations/update=${Math.round(decorations / samples.length)}  ` +
      `avg lines/update=${Math.round(scanned / samples.length)}`,
  );
}

function benchWholeDocument(lines: string[], label: string): void {
  const get = (i: number) => lines[i]!;
  const started = process.hrtime.bigint();
  const result = renderWindows(get, lines.length, [{ start: 0, end: lines.length - 1 }], options({
    maxDecorations: Number.MAX_SAFE_INTEGER,
  }));
  console.log(
    `  ${label.padEnd(34)} ${ms(process.hrtime.bigint() - started).toFixed(1)}ms for ` +
      `${result.count} decorations over ${result.linesScanned} lines`,
  );
}

function benchBlockScan(lines: string[], label: string): void {
  const delimiters = blockDelimitersFor('typescript');
  const started = process.hrtime.bigint();
  scanLines((i) => lines[i]!, 0, lines.length - 1, delimiters, { open: undefined });
  console.log(`  ${label.padEnd(34)} ${ms(process.hrtime.bigint() - started).toFixed(1)}ms`);
}

function main(): void {
  const sizes = [10_000, 50_000, 100_000];
  console.log(`\nIndentyl benchmark  (node ${process.version}, ${process.platform}/${process.arch})`);
  console.log(`viewport ${VIEWPORT} lines, render margin ${MARGIN} lines, palette ${PALETTE}\n`);

  console.log('Windowed update — what Indentyl actually does on every scroll and keystroke:');
  for (const size of sizes) {
    const lines = makeLines(size, 'spaces');
    benchWindowed(lines, `${lines.length.toLocaleString()} lines`);
  }

  console.log('\nMixed tabs and spaces, so the error paths are exercised:');
  for (const size of sizes) {
    const lines = makeLines(size, 'mixed');
    benchWindowed(lines, `${lines.length.toLocaleString()} lines (mixed)`);
  }

  console.log('\nWhole-document render — the approach Indentyl avoids, for comparison:');
  for (const size of sizes) {
    const lines = makeLines(size, 'spaces');
    benchWholeDocument(lines, `${lines.length.toLocaleString()} lines`);
  }

  console.log('\nBlock-comment scan from line 0 (cached per document version):');
  for (const size of sizes) {
    const lines = makeLines(size, 'spaces');
    benchBlockScan(lines, `${lines.length.toLocaleString()} lines`);
  }
  console.log('');
}

main();
