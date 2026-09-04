/** Shared synthetic documents for the render tests and the benchmark. */

export function makeLines(count: number, style: 'spaces' | 'tabs' | 'mixed'): string[] {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const depth = i % 9;
    if (style === 'tabs') {
      lines.push('\t'.repeat(depth) + `line${i}();`);
    } else if (style === 'mixed' && i % 17 === 0) {
      lines.push('  '.repeat(depth) + '\t' + `line${i}();`);
    } else {
      lines.push(' '.repeat(depth * 4) + `line${i}();`);
    }
    if (i % 11 === 0) {
      lines.push('');
    }
  }
  return lines;
}

/** A file with a realistic scattering of block comments. */
export function makeCommentedLines(count: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 40 === 0) {
      lines.push('/**', ' * A doc comment.', ' * Second line.', ' */');
      i += 3;
      continue;
    }
    lines.push(' '.repeat((i % 6) * 4) + `statement${i}();`);
  }
  return lines;
}
