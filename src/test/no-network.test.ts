/**
 * Indentyl claims to make no network requests. This test reads the shipped
 * bundle — the exact file inside the .vsix — and fails if any networking or
 * telemetry primitive appears in it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BUNDLE = path.join(__dirname, '..', '..', 'dist', 'extension.js');

const FORBIDDEN: Array<[string, RegExp]> = [
  ['node:http', /require\(["']node:http["']\)|require\(["']http["']\)/],
  ['node:https', /require\(["']node:https["']\)|require\(["']https["']\)/],
  ['node:net', /require\(["']node:net["']\)|require\(["']net["']\)/],
  ['node:tls', /require\(["']node:tls["']\)|require\(["']tls["']\)/],
  ['node:dgram', /require\(["']node:dgram["']\)|require\(["']dgram["']\)/],
  ['node:dns', /require\(["']node:dns["']\)|require\(["']dns["']\)/],
  ['node:child_process', /require\(["']node:child_process["']\)|require\(["']child_process["']\)/],
  ['fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /\bWebSocket\b/],
  ['navigator.sendBeacon', /sendBeacon/],
  ['vscode telemetry logger', /createTelemetryLogger/],
];

test('the shipped bundle exists', () => {
  assert.ok(fs.existsSync(BUNDLE), `run "npm run bundle" first; ${BUNDLE} is missing`);
});

test('the shipped bundle contains no networking or telemetry primitive', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8');
  const found = FORBIDDEN.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
  assert.deepEqual(found, [], `networking or telemetry found in the bundle: ${found.join(', ')}`);
});

test('the bundle requires nothing but the vscode API itself', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8');
  const required = new Set<string>();
  for (const match of source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
    required.add(match[1]!);
  }
  assert.deepEqual([...required].sort(), ['vscode']);
});
