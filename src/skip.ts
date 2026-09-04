/**
 * Block-comment and multi-line-string regions.
 *
 * Used for one purpose only: not shouting "indent error" at prose inside a
 * `/* ... *\/` block or a Python docstring, where the alignment is deliberate
 * and has nothing to do with code indentation. Level colours are still drawn
 * inside these regions, so the visual rhythm of the file is unbroken.
 *
 * This is a delimiter scanner, not a parser. A delimiter that appears inside a
 * string literal on a single line can put it briefly out of step. That is an
 * acceptable trade for a scan that costs one pass over the file and no grammar.
 */

export interface BlockDelimiter {
  open: string;
  close: string;
}

const C_LIKE: BlockDelimiter[] = [{ open: '/*', close: '*/' }];
const HTML_LIKE: BlockDelimiter[] = [{ open: '<!--', close: '-->' }];

const BY_LANGUAGE: Readonly<Record<string, BlockDelimiter[]>> = {
  javascript: C_LIKE, javascriptreact: C_LIKE, typescript: C_LIKE, typescriptreact: C_LIKE,
  json: C_LIKE, jsonc: C_LIKE, css: C_LIKE, scss: C_LIKE, less: C_LIKE,
  c: C_LIKE, cpp: C_LIKE, csharp: C_LIKE, java: C_LIKE, go: C_LIKE, rust: C_LIKE,
  swift: C_LIKE, kotlin: C_LIKE, dart: C_LIKE, scala: C_LIKE, groovy: C_LIKE,
  php: C_LIKE, objective: C_LIKE, 'objective-c': C_LIKE, zig: C_LIKE,
  html: HTML_LIKE, xml: HTML_LIKE, svg: HTML_LIKE, markdown: HTML_LIKE, vue: HTML_LIKE,
  python: [{ open: '"""', close: '"""' }, { open: "'''", close: "'''" }],
  ruby: [{ open: '=begin', close: '=end' }],
  lua: [{ open: '--[[', close: ']]' }],
  haskell: [{ open: '{-', close: '-}' }],
  elixir: [{ open: '"""', close: '"""' }],
  pascal: [{ open: '{', close: '}' }, { open: '(*', close: '*)' }],
  ocaml: [{ open: '(*', close: '*)' }],
};

export function blockDelimitersFor(languageId: string): BlockDelimiter[] {
  return BY_LANGUAGE[languageId] ?? [];
}

/**
 * For each line, whether it sits *inside* a block region.
 *
 * The line that opens the region and the line that closes it are not marked:
 * they carry code, and their indentation is real indentation.
 */
export interface ScanState {
  /** The delimiter currently open, or undefined at top level. */
  open: BlockDelimiter | undefined;
}

/**
 * Scan a run of lines, resuming from a previous state.
 *
 * Resumable because the controller caches the result and extends it as the user
 * scrolls further into the file, instead of rescanning from line zero on every
 * update.
 */
export function scanLines(
  getLine: (line: number) => string,
  from: number,
  to: number,
  delimiters: readonly BlockDelimiter[],
  state: ScanState,
): { inside: boolean[]; state: ScanState } {
  const inside: boolean[] = [];
  let open = state.open;

  for (let i = from; i <= to; i++) {
    const text = getLine(i);
    let cursor = 0;
    // A line counts as inside when the region was already open before the line
    // began. That deliberately includes the *closing* line: in a doc block the
    // final ` */` is aligned as prose, exactly like the lines above it, and
    // flagging its one-space indent as a mistake is the classic false positive.
    // The *opening* line is excluded, because it carries real code indentation.
    const isInside = open !== undefined;

    for (;;) {
      if (open) {
        const closeAt = text.indexOf(open.close, cursor);
        if (closeAt === -1) {
          break;
        }
        cursor = closeAt + open.close.length;
        open = undefined;
        continue;
      }

      let best: { delimiter: BlockDelimiter; at: number } | undefined;
      for (const delimiter of delimiters) {
        const at = text.indexOf(delimiter.open, cursor);
        if (at !== -1 && (best === undefined || at < best.at)) {
          best = { delimiter, at };
        }
      }
      if (!best) {
        break;
      }
      open = best.delimiter;
      cursor = best.at + best.delimiter.open.length;
    }
    inside.push(isInside);
  }
  return { inside, state: { open } };
}

/**
 * For each line, whether it sits inside a block region. Convenience wrapper over
 * {@link scanLines} for whole-document use and for the tests.
 */
export function computeBlockRegions(
  lines: readonly string[],
  delimiters: readonly BlockDelimiter[],
  maxLines: number,
): boolean[] {
  if (delimiters.length === 0 || lines.length === 0 || lines.length > maxLines) {
    return new Array<boolean>(lines.length).fill(false);
  }
  return scanLines((i) => lines[i]!, 0, lines.length - 1, delimiters, { open: undefined }).inside;
}
