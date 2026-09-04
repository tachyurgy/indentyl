/* eslint-disable */
/**
 * Indentyl integration suite, run inside a real VS Code extension host.
 *
 * There is no VS Code API for reading applied decorations back, so
 * `indentyl.refresh` returns the statistics of the update it performed and the
 * assertions are made against those. That means every number below comes from a
 * real `TextDocument`, a real `TextEditor` and the editor's own resolved
 * indentation options — not a synthetic fixture.
 */
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EXT_ID = 'levelbrook.indentyl';
const WORKSPACE = process.env.INDENTYL_TEST_WORKSPACE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

let activationMs = -1;
let hostReport = {};
const benchmark = [];

async function open(fileName) {
  const uri = vscode.Uri.file(path.join(WORKSPACE, fileName));
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  await sleep(150);
  return editor;
}

async function refresh() {
  return await vscode.commands.executeCommand('indentyl.refresh');
}

async function setEditorIndent(editor, tabSize, insertSpaces) {
  editor.options = { tabSize, insertSpaces };
  await sleep(150);
}

async function closeAll() {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await sleep(200);
}

/* ------------------------------------------------------------------ */

test('the extension is discoverable with the published identifier', async () => {
  const ext = vscode.extensions.getExtension(EXT_ID);
  assert.ok(ext, `extension ${EXT_ID} not found`);
  assert.equal(ext.packageJSON.publisher, 'levelbrook');
  assert.equal(ext.packageJSON.name, 'indentyl');
  assert.equal(ext.packageJSON.license, 'MIT');
});

test('activationEvents is minimal and never "*"', async () => {
  const ext = vscode.extensions.getExtension(EXT_ID);
  const events = ext.packageJSON.activationEvents || [];
  assert.ok(!events.includes('*'), 'activationEvents must not contain "*"');
  assert.deepEqual(events, ['onStartupFinished']);
});

test('it activates, and activation is fast', async () => {
  const ext = vscode.extensions.getExtension(EXT_ID);
  const t0 = Date.now();
  await ext.activate();
  activationMs = Date.now() - t0;
  assert.ok(ext.isActive, 'extension did not activate');
  assert.ok(activationMs < 3000, `activation took ${activationMs}ms`);
  hostReport = {
    vscode: vscode.version,
    node: process.versions.node,
    electron: process.versions.electron,
  };
});

test('every contributed command is actually registered', async () => {
  const ext = vscode.extensions.getExtension(EXT_ID);
  const declared = ext.packageJSON.contributes.commands.map((c) => c.command);
  const registered = await vscode.commands.getCommands(true);
  const missing = declared.filter((c) => !registered.includes(c));
  assert.deepEqual(missing, [], `declared but not registered: ${missing.join(', ')}`);
  assert.equal(declared.length, 3);
});

test('every contributed setting resolves through the configuration API', async () => {
  const ext = vscode.extensions.getExtension(EXT_ID);
  const props = ext.packageJSON.contributes.configuration.properties;
  const config = vscode.workspace.getConfiguration();
  for (const key of Object.keys(props)) {
    assert.notEqual(config.get(key), undefined, `${key} did not resolve`);
  }
  assert.ok(Object.keys(props).length >= 18);
});

test('opening a real document produces real decorations', async () => {
  await open('large.ts');
  const stats = await refresh();
  assert.ok(stats, 'refresh returned nothing');
  assert.ok(stats.decorations > 0, 'no decorations were built');
  assert.ok(stats.levels > 0);
  assert.equal(stats.capped, false);
});

test('only the viewport plus the margin is decorated in a 12,000-line file', async () => {
  const editor = await open('large.ts');
  assert.equal(editor.document.lineCount, 12001);
  const stats = await refresh();
  // Viewport plus a 200-line margin either side. Far, far less than the file.
  assert.ok(stats.linesScanned < 1000, `scanned ${stats.linesScanned} lines`);
  assert.ok(stats.linesScanned > 100, `scanned only ${stats.linesScanned} lines`);
  benchmark.push(
    `12,001-line file, single update: ${stats.linesScanned} lines scanned, ` +
      `${stats.decorations} decorations, ${stats.elapsedMs.toFixed(3)} ms`,
  );
});

test('scrolling a 12,000-line file stays fast, measured in the real editor', async () => {
  const editor = await open('large.ts');
  const samples = [];
  let decorations = 0;
  let scanned = 0;
  for (let line = 0; line < 12000; line += 300) {
    editor.revealRange(
      new vscode.Range(line, 0, line, 0),
      vscode.TextEditorRevealType.AtTop,
    );
    await sleep(15);
    const stats = await refresh();
    samples.push(stats.elapsedMs);
    decorations += stats.decorations;
    scanned += stats.linesScanned;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const max = Math.max(...samples);
  benchmark.push(
    `12,001-line file, ${samples.length} scrolled updates: mean ${mean.toFixed(3)} ms, ` +
      `p95 ${p95.toFixed(3)} ms, max ${max.toFixed(3)} ms, ` +
      `avg ${Math.round(decorations / samples.length)} decorations over ` +
      `${Math.round(scanned / samples.length)} lines per update`,
  );
  assert.ok(max < 100, `slowest update was ${max}ms`);
  assert.ok(mean < 25, `mean update was ${mean.toFixed(2)}ms`);
});

test('the editor resolved tab size is used, not a global default', async () => {
  // The headline correctness claim, verified end to end. A file indented two
  // spaces per level is correct at tabSize 2 and ragged at tabSize 4, and
  // Indentyl must follow the editor either way.
  const editor = await open('two-space.ts');

  await setEditorIndent(editor, 2, true);
  const atTwo = await refresh();
  assert.equal(atTwo.tabSize, 2);
  assert.equal(atTwo.errors, 0, 'a 2-space file read at tabSize 2 must have no errors');
  assert.ok(atTwo.levels > 0);

  await setEditorIndent(editor, 4, true);
  const atFour = await refresh();
  assert.equal(atFour.tabSize, 4);
  assert.ok(atFour.errors > 0, 'a 2-space file read at tabSize 4 is ragged and must be flagged');
});

test('a tab-indented file is clean when the editor says the file uses tabs', async () => {
  const editor = await open('tabbed.go');
  await setEditorIndent(editor, 4, false);
  const stats = await refresh();
  assert.equal(stats.insertSpaces, false);
  assert.equal(stats.errors, 0);
  assert.equal(stats.tabmix, 0);
  assert.ok(stats.levels > 0);
});

test('the same tab-indented file is flagged when the editor says spaces', async () => {
  const editor = await open('tabbed.go');
  await setEditorIndent(editor, 4, true);
  const stats = await refresh();
  assert.ok(stats.tabmix > 0, 'tabs in a space-indented file must be flagged');
});

test('a ragged indent is reported as an error', async () => {
  const editor = await open('ragged.ts');
  await setEditorIndent(editor, 4, true);
  const stats = await refresh();
  assert.ok(stats.errors > 0);
});

test('a doc comment does not produce a false error on its closing line', async () => {
  const editor = await open('docblock.ts');
  await setEditorIndent(editor, 4, true);
  const stats = await refresh();
  // Only `  code();` is a real mistake. The two one-space comment lines are not.
  assert.equal(stats.errors, 1, `expected exactly one error, got ${stats.errors}`);
});

test('a file with no indentation produces no decorations', async () => {
  await open('flat.ts');
  const stats = await refresh();
  assert.equal(stats.decorations, 0);
});

test('the toggle command turns decoration off and back on', async () => {
  await open('large.ts');
  assert.ok((await refresh()).decorations > 0);
  await vscode.commands.executeCommand('indentyl.toggle');
  await sleep(200);
  assert.equal((await refresh()).decorations, 0, 'toggle did not switch it off');
  await vscode.commands.executeCommand('indentyl.toggle');
  await sleep(200);
  assert.ok((await refresh()).decorations > 0, 'toggle did not switch it back on');
});

test('indentyl.enabled false stops all decoration', async () => {
  await open('large.ts');
  const config = vscode.workspace.getConfiguration('indentyl');
  await config.update('enabled', false, vscode.ConfigurationTarget.Workspace);
  await sleep(400);
  assert.equal((await refresh()).decorations, 0);
  await config.update('enabled', undefined, vscode.ConfigurationTarget.Workspace);
  await sleep(400);
  assert.ok((await refresh()).decorations > 0);
});

test('an excluded language is left alone', async () => {
  await open('large.ts');
  const config = vscode.workspace.getConfiguration('indentyl');
  await config.update('excludedLanguages', ['typescript'], vscode.ConfigurationTarget.Workspace);
  await sleep(400);
  assert.equal((await refresh()).decorations, 0);
  await config.update('excludedLanguages', undefined, vscode.ConfigurationTarget.Workspace);
  await sleep(400);
  assert.ok((await refresh()).decorations > 0);
});

test('editing a document keeps the decorations correct', async () => {
  const editor = await open('ragged.ts');
  await setEditorIndent(editor, 4, true);
  const before = await refresh();
  await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), '        '));
  await sleep(300);
  const after = await refresh();
  assert.ok(after.levels > before.levels, 'the new indentation was not picked up');
});

test('the More Levelbrook Tools command opens a local webview', async () => {
  await closeAll();
  await vscode.commands.executeCommand('indentyl.moreTools');
  await sleep(600);
  const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
  const webview = tabs.find((t) => t.label === 'More Levelbrook Tools');
  assert.ok(webview, 'the tools panel was not found');
  await vscode.window.tabGroups.close(webview);
});

test('refreshing with no editor open does not throw', async () => {
  await closeAll();
  await vscode.commands.executeCommand('indentyl.refresh');
});

/* ------------------------------------------------------------------ */

exports.run = async function run() {
  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
    } catch (e) {
      results.push({ name: t.name, ok: false, error: (e && e.stack) || String(e) });
    }
  }
  const passed = results.filter((r) => r.ok).length;
  fs.writeFileSync(
    process.env.INDENTYL_TEST_RESULTS,
    JSON.stringify(
      {
        results,
        passed,
        failed: results.length - passed,
        total: results.length,
        activationMs,
        benchmark,
        host: hostReport,
      },
      null,
      2,
    ),
    'utf8',
  );
  if (passed !== results.length) {
    throw new Error(`${results.length - passed} integration test(s) failed`);
  }
};
