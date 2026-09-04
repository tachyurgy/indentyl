/**
 * The VS Code side: decoration types, the visible-range update loop, and the
 * caches that keep it cheap.
 *
 * Everything expensive happens in `render.ts`, which knows nothing about
 * VS Code. This file's job is to feed it the right lines, at the right moment,
 * and no more often than necessary.
 */

import * as vscode from 'vscode';
import { renderWindows, type PlacedSpan, type RenderResult } from './render';
import { computeWindows, type LineRange } from './window';
import { blockDelimitersFor, scanLines, type ScanState } from './skip';
import { compilePatterns, resolvePalette, type Palette, type ThemeKind } from './palette';

interface Settings {
  enabled: boolean;
  style: 'background' | 'leftBorder';
  detectErrors: boolean;
  ignoreErrorLanguages: string[];
  ignoreErrorsInBlockComments: boolean;
  ignoreLinePatterns: RegExp[];
  includedLanguages: string[];
  excludedLanguages: string[];
  colorEmptyLines: boolean;
  renderMarginLines: number;
  maxDecorations: number;
  updateDelayMs: number;
  maxIndentColumns: number;
  maxBlockCommentScanLines: number;
  palette: Palette;
}

interface BlockCache {
  version: number;
  inside: boolean[];
  scannedTo: number;
  state: ScanState;
}

/**
 * Numbers from the most recent update.
 *
 * Returned by the `indentyl.refresh` command, so the effect of an update can be
 * inspected from the editor and asserted on by the integration tests. There is
 * no API for reading applied decorations back, and "the promise resolved" is
 * not evidence that anything was drawn.
 */
export interface UpdateStats {
  linesScanned: number;
  decorations: number;
  levels: number;
  errors: number;
  tabmix: number;
  tabSize: number;
  insertSpaces: boolean;
  capped: boolean;
  elapsedMs: number;
}

export class IndentController implements vscode.Disposable {
  private levelTypes: vscode.TextEditorDecorationType[] = [];
  private errorType: vscode.TextEditorDecorationType | undefined;
  private tabmixType: vscode.TextEditorDecorationType | undefined;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly blockCaches = new Map<string, BlockCache>();
  private readonly disposables: vscode.Disposable[] = [];
  private paletteKey = '';
  private suspended = false;
  lastStats: UpdateStats | undefined;

  constructor() {
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(() => this.updateAllSoon()),
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => this.schedule(event.textEditor)),
      vscode.window.onDidChangeTextEditorOptions((event) => this.schedule(event.textEditor)),
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.paletteKey = '';
        this.updateAllSoon();
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.blockCaches.delete(event.document.uri.toString());
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document === event.document) {
            this.schedule(editor);
          }
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.blockCaches.delete(document.uri.toString());
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('indentyl')) {
          this.paletteKey = '';
          this.updateAllSoon();
        }
      }),
    );
  }

  toggle(): boolean {
    this.suspended = !this.suspended;
    this.updateAllSoon();
    return !this.suspended;
  }

  updateAllSoon(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.schedule(editor);
    }
  }

  /** Update now, skipping the debounce. Used by the Refresh command. */
  updateNow(): UpdateStats | undefined {
    this.lastStats = undefined;
    for (const editor of vscode.window.visibleTextEditors) {
      this.update(editor);
    }
    return this.lastStats;
  }

  private schedule(editor: vscode.TextEditor): void {
    const key = editorKey(editor);
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const delay = vscode.workspace
      .getConfiguration('indentyl', editor.document.uri)
      .get<number>('updateDelayMs', 60);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      // The editor may have closed while the timer was pending.
      if (vscode.window.visibleTextEditors.includes(editor)) {
        this.update(editor);
      }
    }, Math.max(0, delay));
    timer.unref?.();
    this.timers.set(key, timer);
  }

  private readSettings(uri: vscode.Uri): Settings {
    const config = vscode.workspace.getConfiguration('indentyl', uri);
    const theme = themeKind(vscode.window.activeColorTheme.kind);
    return {
      enabled: config.get<boolean>('enabled', true),
      style: config.get<'background' | 'leftBorder'>('style', 'background'),
      detectErrors: config.get<boolean>('detectErrors', true),
      ignoreErrorLanguages: config.get<string[]>('ignoreErrorLanguages', []),
      ignoreErrorsInBlockComments: config.get<boolean>('ignoreErrorsInBlockComments', true),
      ignoreLinePatterns: compilePatterns(config.get<string[]>('ignoreLinePatterns', [])),
      includedLanguages: config.get<string[]>('includedLanguages', []),
      excludedLanguages: config.get<string[]>('excludedLanguages', []),
      colorEmptyLines: config.get<boolean>('colorEmptyLines', false),
      renderMarginLines: config.get<number>('renderMarginLines', 200),
      maxDecorations: config.get<number>('maxDecorationsPerEditor', 20000),
      updateDelayMs: config.get<number>('updateDelayMs', 60),
      maxIndentColumns: config.get<number>('maxIndentColumns', 256),
      maxBlockCommentScanLines: config.get<number>('maxBlockCommentScanLines', 50000),
      palette: resolvePalette(
        {
          colors: config.get<string[]>('colors', []),
          colorsLight: config.get<string[]>('colorsLight', []),
          colorsDark: config.get<string[]>('colorsDark', []),
          colorsHighContrast: config.get<string[]>('colorsHighContrast', []),
          errorColor: config.get<string>('errorColor', 'rgba(228,87,46,0.35)'),
          tabmixColor: config.get<string>('tabmixColor', 'rgba(230,180,40,0.35)'),
          opacity: config.get<number>('opacity', 1),
        },
        theme,
      ),
    };
  }

  private ensureDecorationTypes(settings: Settings): void {
    const key = JSON.stringify([settings.palette, settings.style]);
    if (key === this.paletteKey && this.levelTypes.length > 0) {
      return;
    }
    this.disposeTypes();
    const make = (color: string): vscode.TextEditorDecorationType =>
      vscode.window.createTextEditorDecorationType(
        settings.style === 'leftBorder'
          ? { borderStyle: 'solid', borderWidth: '0 0 0 1px', borderColor: color }
          : { backgroundColor: color },
      );
    this.levelTypes = settings.palette.levels.map(make);
    this.errorType = make(settings.palette.error);
    this.tabmixType = make(settings.palette.tabmix);
    this.paletteKey = key;
  }

  private disposeTypes(): void {
    for (const type of this.levelTypes) {
      type.dispose();
    }
    this.levelTypes = [];
    this.errorType?.dispose();
    this.tabmixType?.dispose();
    this.errorType = undefined;
    this.tabmixType = undefined;
    this.paletteKey = '';
  }

  private shouldDecorate(document: vscode.TextDocument, settings: Settings): boolean {
    if (!settings.enabled || this.suspended) {
      return false;
    }
    if (settings.excludedLanguages.includes(document.languageId)) {
      return false;
    }
    if (settings.includedLanguages.length > 0) {
      return settings.includedLanguages.includes(document.languageId);
    }
    return true;
  }

  private update(editor: vscode.TextEditor): void {
    // performance.now() rather than Date.now(): a normal update is well under a
    // millisecond, which Date.now() cannot resolve.
    const started = performance.now();
    const document = editor.document;
    const settings = this.readSettings(document.uri);
    this.ensureDecorationTypes(settings);

    if (!this.shouldDecorate(document, settings)) {
      this.clear(editor);
      this.lastStats = {
        linesScanned: 0, decorations: 0, levels: 0, errors: 0, tabmix: 0,
        tabSize: normaliseTabSize(editor.options.tabSize),
        insertSpaces: editor.options.insertSpaces === true,
        capped: false, elapsedMs: round3(performance.now() - started),
      };
      return;
    }

    const visible: LineRange[] = editor.visibleRanges.map((range) => ({
      start: range.start.line,
      end: range.end.line,
    }));
    const windows = computeWindows(visible, settings.renderMarginLines, document.lineCount);
    if (windows.length === 0) {
      this.clear(editor);
      return;
    }

    // The editor's resolved options, not a global setting. This is the whole
    // reason a tab-indented file and a space-indented file both come out right.
    const tabSize = normaliseTabSize(editor.options.tabSize);
    const insertSpaces = editor.options.insertSpaces === true;

    const errorsAllowedHere =
      settings.detectErrors &&
      !settings.ignoreErrorLanguages.includes('*') &&
      !settings.ignoreErrorLanguages.includes(document.languageId);

    const isInsideBlock = errorsAllowedHere && settings.ignoreErrorsInBlockComments
      ? this.blockLookup(document, windows, settings.maxBlockCommentScanLines)
      : undefined;

    const getLine = (line: number): string => document.lineAt(line).text;
    const result = renderWindows(getLine, document.lineCount, windows, {
      tabSize,
      insertSpaces,
      detectErrors: errorsAllowedHere,
      maxIndentColumns: settings.maxIndentColumns,
      paletteSize: this.levelTypes.length,
      colorEmptyLines: settings.colorEmptyLines,
      maxDecorations: settings.maxDecorations,
      ...(isInsideBlock ? { isInsideBlock } : {}),
      ...(settings.ignoreLinePatterns.length > 0
        ? { ignoreLinePatterns: settings.ignoreLinePatterns }
        : {}),
    });

    this.apply(editor, result);
    this.lastStats = {
      linesScanned: result.linesScanned,
      decorations: result.count,
      levels: result.levels.reduce((total, bucket) => total + bucket.length, 0),
      errors: result.error.length,
      tabmix: result.tabmix.length,
      tabSize,
      insertSpaces,
      capped: result.capped,
      elapsedMs: round3(performance.now() - started),
    };
  }

  /**
   * Block-region lookup for this document, extended lazily as the user scrolls
   * deeper into the file and cached per document version.
   */
  private blockLookup(
    document: vscode.TextDocument,
    windows: readonly LineRange[],
    maxScanLines: number,
  ): ((line: number) => boolean) | undefined {
    const delimiters = blockDelimitersFor(document.languageId);
    if (delimiters.length === 0 || document.lineCount > maxScanLines) {
      return undefined;
    }
    const needed = Math.min(document.lineCount - 1, windows[windows.length - 1]!.end);
    const key = document.uri.toString();
    let cache = this.blockCaches.get(key);
    if (!cache || cache.version !== document.version) {
      cache = { version: document.version, inside: [], scannedTo: -1, state: { open: undefined } };
      this.blockCaches.set(key, cache);
    }
    if (cache.scannedTo < needed) {
      const scanned = scanLines(
        (line) => document.lineAt(line).text,
        cache.scannedTo + 1,
        needed,
        delimiters,
        cache.state,
      );
      cache.inside.push(...scanned.inside);
      cache.state = scanned.state;
      cache.scannedTo = needed;
    }
    const inside = cache.inside;
    return (line: number): boolean => inside[line] === true;
  }

  private apply(editor: vscode.TextEditor, result: RenderResult): void {
    const toRanges = (spans: readonly PlacedSpan[]): vscode.Range[] =>
      spans.map((span) => new vscode.Range(span.line, span.start, span.line, span.end));

    for (let i = 0; i < this.levelTypes.length; i++) {
      editor.setDecorations(this.levelTypes[i]!, toRanges(result.levels[i] ?? []));
    }
    if (this.errorType) {
      editor.setDecorations(this.errorType, toRanges(result.error));
    }
    if (this.tabmixType) {
      editor.setDecorations(this.tabmixType, toRanges(result.tabmix));
    }
  }

  private clear(editor: vscode.TextEditor): void {
    for (const type of this.levelTypes) {
      editor.setDecorations(type, []);
    }
    if (this.errorType) {
      editor.setDecorations(this.errorType, []);
    }
    if (this.tabmixType) {
      editor.setDecorations(this.tabmixType, []);
    }
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.blockCaches.clear();
    this.disposeTypes();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function editorKey(editor: vscode.TextEditor): string {
  return `${editor.document.uri.toString()}::${editor.viewColumn ?? 'none'}`;
}

function normaliseTabSize(value: number | string | undefined): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 4;
}

function themeKind(kind: vscode.ColorThemeKind): ThemeKind {
  switch (kind) {
    case vscode.ColorThemeKind.Light:
      return 'light';
    case vscode.ColorThemeKind.HighContrast:
      return 'highContrast';
    case vscode.ColorThemeKind.HighContrastLight:
      return 'highContrastLight';
    default:
      return 'dark';
  }
}
