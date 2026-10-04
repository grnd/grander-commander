#!/usr/bin/env node
// Launch the packaged .app and fail the build unless it reports a live window.
// Pairs with src/main/smoke.ts, which does the asserting inside the app.
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.env.GC_DIST_DIR ?? 'dist';
const TIMEOUT_MS = 120_000;
const OK = 'GC_SMOKE_OK';

function findApp() {
  if (!existsSync(DIST)) throw new Error(`${DIST}/ does not exist — build before smoking`);
  // electron-builder writes mac/, mac-arm64/, mac-universal/ depending on arch.
  const dirs = readdirSync(DIST, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('mac'))
    .map((e) => join(DIST, e.name));
  for (const dir of dirs) {
    const bundle = readdirSync(dir).find((n) => n.endsWith('.app'));
    if (bundle) return join(dir, bundle);
  }
  throw new Error(`no .app bundle under ${DIST}/mac* (looked in: ${dirs.join(', ') || 'nothing'})`);
}

function executableIn(appPath) {
  const macos = join(appPath, 'Contents', 'MacOS');
  const [bin] = readdirSync(macos);
  if (!bin) throw new Error(`no executable in ${macos}`);
  return join(macos, bin);
}

const appPath = findApp();
const bin = executableIn(appPath);
console.log(`smoke: launching ${bin}`);

const child = spawn(bin, { env: { ...process.env, GC_SMOKE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (d) => { output += d; process.stdout.write(d); });
child.stderr.on('data', (d) => { output += d; process.stderr.write(d); });

const timer = setTimeout(() => {
  console.error(`smoke: no verdict within ${TIMEOUT_MS / 1000}s — killing the app`);
  child.kill('SIGKILL');
}, TIMEOUT_MS);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  if (code === 0 && output.includes(OK)) {
    console.log('smoke: packaged app started with a live window');
    process.exit(0);
  }
  console.error(`smoke: FAILED (exit ${code}, signal ${signal}) — the packaged app did not report ${OK}`);
  process.exit(1);
});
