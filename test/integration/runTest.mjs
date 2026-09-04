import { runTests } from '@vscode/test-electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(here, '../..');
const extensionTestsPath = path.resolve(here, 'suite/index.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'indentyl-itest-'));
const workspace = path.join(scratch, 'workspace');
fs.mkdirSync(path.join(workspace, '.vscode'), { recursive: true });

/** A file indented with `unit` spaces per level, cycling through nine depths. */
function spaceIndented(lineCount, unit) {
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(' '.repeat((i % 9) * unit) + `statement${i}();`);
  }
  return lines.join('\n') + '\n';
}

function tabIndented(lineCount) {
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push('\t'.repeat(i % 9) + `statement${i}();`);
  }
  return lines.join('\n') + '\n';
}

// The large file for the real-editor benchmark. 12,000 lines, comfortably over
// the 10,000 the brief asks for.
fs.writeFileSync(path.join(workspace, 'large.ts'), spaceIndented(12000, 4), 'utf8');
// The same content at 2-space indentation: the file whose colouring depends
// entirely on reading the editor's resolved tab size rather than a default.
fs.writeFileSync(path.join(workspace, 'two-space.ts'), spaceIndented(400, 2), 'utf8');
fs.writeFileSync(path.join(workspace, 'tabbed.go'), tabIndented(400), 'utf8');
fs.writeFileSync(
  path.join(workspace, 'ragged.ts'),
  'a();\n  b();\n      c();\n        d();\n',
  'utf8',
);
fs.writeFileSync(
  path.join(workspace, 'docblock.ts'),
  ['/**', ' * A doc comment whose continuation lines are indented by one space.', ' */', '  code();', ''].join('\n'),
  'utf8',
);
fs.writeFileSync(path.join(workspace, 'flat.ts'), 'a();\nb();\nc();\n', 'utf8');
fs.writeFileSync(
  path.join(workspace, '.vscode', 'settings.json'),
  JSON.stringify(
    {
      'editor.detectIndentation': false,
      'editor.tabSize': 4,
      'editor.insertSpaces': true,
      'indentyl.updateDelayMs': 0,
      'indentyl.renderMarginLines': 200,
    },
    null,
    2,
  ),
  'utf8',
);

const resultsFile = path.join(scratch, 'results.json');

const sharedRoot = path.resolve(
  here,
  '../../../timeslice/.vscode-test/vscode-darwin-arm64-1.136.1/Visual Studio Code.app/Contents/MacOS',
);
const vscodeExecutablePath = [
  path.join(sharedRoot, 'Electron'),
  path.join(sharedRoot, 'Code'),
].find((candidate) => fs.existsSync(candidate));

try {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}),
    launchArgs: [
      workspace,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-gpu',
      '--user-data-dir',
      path.join(scratch, 'user-data'),
      '--extensions-dir',
      path.join(scratch, 'extensions'),
    ],
    extensionTestsEnv: {
      INDENTYL_TEST_WORKSPACE: workspace,
      INDENTYL_TEST_RESULTS: resultsFile,
    },
  });
} catch (err) {
  console.error('\nintegration: runner reported failure:', err.message);
  process.exitCode = 1;
} finally {
  if (fs.existsSync(resultsFile)) {
    const r = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    console.log('\n===== INDENTYL INTEGRATION RESULTS =====');
    for (const t of r.results) {
      console.log(`  ${t.ok ? 'PASS' : 'FAIL'}  ${t.name}${t.ok ? '' : '\n        ' + t.error}`);
    }
    console.log(`\n  ${r.passed} passed, ${r.failed} failed, ${r.total} total`);
    console.log(`  activation: ${r.activationMs} ms`);
    if (r.benchmark) {
      console.log('\n  --- real-editor benchmark ---');
      for (const line of r.benchmark) console.log(`  ${line}`);
    }
    console.log(`  host: ${JSON.stringify(r.host)}`);
    console.log('========================================');
    if (r.failed > 0) {
      process.exitCode = 1;
    }
  } else {
    console.error('\nNo results file was produced — the suite did not finish.');
    process.exitCode = 1;
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}
