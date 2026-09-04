import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Reports esbuild problems in a format the VS Code problem matcher understands. */
const problemsPlugin = {
  name: 'problems',
  setup(build) {
    build.onEnd((result) => {
      for (const e of result.errors) {
        console.error(`✘ ${e.text}`);
        if (e.location) console.error(`    ${e.location.file}:${e.location.line}:${e.location.column}`);
      }
      console.log(`[esbuild] build ${result.errors.length ? 'FAILED' : 'ok'}`);
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/extension.js',
  // `vscode` is provided by the host at runtime and must never be bundled.
  external: ['vscode'],
  logLevel: 'warning',
  legalComments: 'none',
  plugins: [problemsPlugin],
});

if (watch) await ctx.watch();
else { await ctx.rebuild(); await ctx.dispose(); }
