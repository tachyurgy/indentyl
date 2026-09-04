import * as vscode from 'vscode';

interface Tool {
  name: string;
  tagline: string;
  body: string;
  id: string;
}

const TOOLS: readonly Tool[] = [
  {
    name: 'Indentyl',
    id: 'levelbrook.indentyl',
    tagline: 'Colourised indent guides that stay correct on every platform.',
    body: 'Respects the file’s real tab size, flags mixed tabs and spaces, and renders only what is on screen so it stays fast in a 100k-line file. Free forever.',
  },
  {
    name: 'Timeslice',
    id: 'levelbrook.timeslice',
    tagline: 'Coding time tracking that never leaves your machine.',
    body: 'Per-project and per-language time, stored locally in your own database. No account, no server, no upload.',
  },
  {
    name: 'Sendpad',
    id: 'levelbrook.sendpad',
    tagline: 'An HTTP client for your existing .http files.',
    body: 'Send requests from .http and .rest files, chain responses, and keep your collections as plain text in git.',
  },
  {
    name: 'Branchline',
    id: 'levelbrook.branchline',
    tagline: 'A fast, readable git graph.',
    body: 'A virtualised commit graph that stays responsive in large repositories, with the history view kept free.',
  },
  {
    name: 'Auditable',
    id: 'levelbrook.auditable',
    tagline: 'Accessibility checks in the editor.',
    body: 'WCAG and European Accessibility Act checks against your markup while you write it.',
  },
];

/**
 * The one and only cross-promotion surface in Runbox.
 *
 * It is a command the user has to run on purpose. There is no popup, no
 * notification, no status-bar advert and no first-run interstitial, and the
 * webview makes no network requests: the whole page is inline, and the links
 * open the local Extensions view rather than a browser.
 */
export function showMoreTools(context: vscode.ExtensionContext, productName: string): void {
  const panel = vscode.window.createWebviewPanel(
    'indentyl.moreTools',
    'More Levelbrook Tools',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: false },
  );
  panel.webview.html = renderHtml(productName);
  panel.webview.onDidReceiveMessage(
    (message: { command?: string; id?: string }) => {
      if (message?.command === 'open' && typeof message.id === 'string') {
        void vscode.commands.executeCommand('workbench.extensions.search', `@id:${message.id}`);
      }
    },
    undefined,
    context.subscriptions,
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function renderHtml(productName: string): string {
  const nonce = Array.from({ length: 32 }, () =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)],
  ).join('');
  const cards = TOOLS.filter((tool) => tool.name !== productName)
    .map(
      (tool) => `
      <article class="card">
        <h2>${escapeHtml(tool.name)}</h2>
        <p class="tagline">${escapeHtml(tool.tagline)}</p>
        <p class="body">${escapeHtml(tool.body)}</p>
        <button data-id="${escapeHtml(tool.id)}">Find in Extensions</button>
      </article>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>More Levelbrook Tools</title>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         padding: 1.6rem 2rem; max-width: 60rem; line-height: 1.55; }
  h1 { font-size: 1.35rem; margin: 0 0 .35rem; }
  .lede { color: var(--vscode-descriptionForeground); margin: 0 0 1.6rem; max-width: 46rem; }
  .grid { display: grid; gap: .9rem; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); }
  .card { border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
          border-radius: 6px; padding: 1rem 1.1rem 1.1rem; }
  .card h2 { font-size: 1rem; margin: 0 0 .25rem; }
  .tagline { margin: 0 0 .5rem; font-weight: 600; }
  .body { margin: 0 0 .9rem; color: var(--vscode-descriptionForeground); font-size: .9rem; }
  button { font: inherit; font-size: .85rem; cursor: pointer; border: 0; border-radius: 3px;
           padding: .35rem .8rem; color: var(--vscode-button-foreground);
           background: var(--vscode-button-background); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  footer { margin-top: 2rem; font-size: .85rem; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
  <h1>More Levelbrook tools</h1>
  <p class="lede">Every one of these is built on the same two promises: nothing you do is ever
     transmitted anywhere, and a feature that was free stays free.</p>
  <div class="grid">${cards}</div>
  <footer>This page is local. It loads nothing from the internet and reports nothing back.</footer>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    for (const button of document.querySelectorAll('button[data-id]')) {
      button.addEventListener('click', () => {
        vscode.postMessage({ command: 'open', id: button.dataset.id });
      });
    }
  </script>
</body>
</html>`;
}
