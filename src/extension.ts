/**
 * Indentyl — colourised indent guides that stay correct everywhere.
 *
 * Indentyl makes no network requests. There is no analytics client, no crash
 * reporter and no remote configuration; the shipped bundle imports nothing but
 * `vscode`.
 */

import * as vscode from 'vscode';
import { IndentController } from './controller';
import { showMoreTools } from './more';

export function activate(context: vscode.ExtensionContext): void {
  const controller = new IndentController();
  context.subscriptions.push(controller);

  context.subscriptions.push(
    vscode.commands.registerCommand('indentyl.toggle', () => {
      const enabled = controller.toggle();
      void vscode.window.setStatusBarMessage(
        `Indentyl: indent colouring ${enabled ? 'on' : 'off'}`,
        2000,
      );
    }),
    // Returns the update statistics. `executeCommand` resolves with them, which
    // is how the integration tests observe that decorations were really built.
    vscode.commands.registerCommand('indentyl.refresh', () => {
      const stats = controller.updateNow();
      if (stats) {
        void vscode.window.setStatusBarMessage(
          `Indentyl: ${stats.decorations} guides over ${stats.linesScanned} lines in ${stats.elapsedMs.toFixed(2)} ms` +
            (stats.capped ? ' (capped)' : ''),
          4000,
        );
      }
      return stats;
    }),
    vscode.commands.registerCommand('indentyl.moreTools', () => showMoreTools(context, 'Indentyl')),
  );

  controller.updateNow();
}

export function deactivate(): void {
  // The controller is disposed through context.subscriptions.
}
