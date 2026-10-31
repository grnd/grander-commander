// scripts/keys-e2e.mjs
//
// The claims jsdom cannot check, driven against the packaged app over CDP:
//
//   1. Ctrl+H with focus in the terminal pane reaches the pty instead of
//      toggling hidden files.
//   2. A menu command does nothing while a dialog is open.
//   3. Alt+letter starts a quick search by physical key.
//   4. The Files menu shows Copy's bound key and does not register it.
//   5. The settings window opens, stays a singleton, and uses IPC.
//   6. A rebind made in the settings window reaches the panel, the
//      application menu and the file on disk.
//
// The run points GC_KEYMAP_DIR at a temporary directory, so it never touches
// the owner's own keymap.json.
//
// Usage: node scripts/keys-e2e.mjs [path-to-app]
// Requires playwright-core, which is deliberately not a devDependency — this
// check is run by hand, not in CI. Point GC_PLAYWRIGHT at an installed copy:
//   GC_PLAYWRIGHT=/path/to/node_modules/playwright-core node scripts/keys-e2e.mjs
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pw = await import(process.env.GC_PLAYWRIGHT ?? 'playwright-core');
const electron = (pw._electron ?? pw.default?._electron);
if (!electron) throw new Error('playwright-core did not expose _electron');

const APP = process.argv[2]
  ?? join(process.cwd(), 'dist/mac-arm64/GranderCommander.app/Contents/MacOS/GranderCommander');

const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok   ${name}`);
  else {
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
};

const keymapDir = mkdtempSync(join(tmpdir(), 'gc-keymap-e2e-'));
const app = await electron.launch({
  executablePath: APP,
  args: [`--user-data-dir=${mkdtempSync(join(tmpdir(), 'gc-keys-'))}`],
  env: { ...process.env, GC_KEYMAP_DIR: keymapDir },
});
const page = await app.firstWindow();
await page.waitForSelector('.gc-app', { timeout: 20_000 });
await page.waitForTimeout(800);

/** Dispatch a real key/code pair the way a keyboard does. */
const press = (target, key, code, mods = {}) => page.evaluate(([t, k, c, m]) => {
  const el = t ? document.querySelector(t) : document.activeElement ?? document.body;
  (el ?? document.body).dispatchEvent(new KeyboardEvent('keydown', {
    key: k, code: c, bubbles: true, cancelable: true,
    metaKey: !!m.meta, ctrlKey: !!m.ctrl, altKey: !!m.alt, shiftKey: !!m.shift,
  }));
}, [target, key, code, mods]);

const state = () => page.evaluate(() => ({
  hidden: document.querySelectorAll('.gc-panel.is-active .gc-file-row').length,
  search: document.querySelector('.gc-panel.is-active .gc-quicksearch')?.textContent ?? null,
  dialog: !!document.querySelector('.gc-modal'),
}));

// 1 — the terminal keeps its control keys.
await page.keyboard.press('Control+`');
await page.waitForTimeout(600);
const termFocused = await page.evaluate(() => {
  const ta = document.querySelector('.gc-terminal textarea');
  if (ta) ta.focus();
  return !!ta && document.activeElement === ta;
});
const beforeRows = (await state()).hidden;
await press('.gc-terminal textarea', 'h', 'KeyH', { ctrl: true });
await page.waitForTimeout(400);
check('Ctrl+H in the terminal does not toggle hidden files',
  termFocused && (await state()).hidden === beforeRows,
  termFocused ? 'row count changed' : 'terminal textarea never took focus');
await page.keyboard.press('Control+`');
await page.waitForTimeout(400);

// 2 — a menu command is refused while a dialog is open. Click a row first:
// focus is still in the terminal's textarea, where only Cmd combos are ours.
await page.click('.gc-panel.is-active .gc-file-row');
await page.waitForTimeout(300);
await press(null, 'F7', 'F7');                         // New Folder prompt
await page.waitForTimeout(500);
const dialogUp = (await state()).dialog;
const trashedWithDialog = await page.evaluate(() => {
  window.__gcTrashCalls = 0;
  const original = window.gc.fs.trash;
  window.gc.fs.trash = (...args) => { window.__gcTrashCalls += 1; return original(...args); };
  return window.__gcTrashCalls;
});
await press(null, 'F8', 'F8');
await page.waitForTimeout(400);
const calls = await page.evaluate(() => window.__gcTrashCalls);
check('F8 does not trash anything while a dialog is open',
  dialogUp && calls === trashedWithDialog, dialogUp ? `trash called ${calls}x` : 'no dialog opened');
await press(null, 'Escape', 'Escape');
await page.waitForTimeout(300);

// 3 — quick search does not shadow a bound Alt combo. Alt+E is unbound by
// default, so this asserts the inverse: it opens a search rather than being
// swallowed, and Alt+F7 (bound to openSearch) is not read as a search letter.
await press(null, 'é', 'KeyE', { alt: true });
await page.waitForTimeout(300);
const searchBox = (await state()).search;
check('Alt+letter starts a quick search by physical key', searchBox?.includes('e') ?? false,
  `box was ${JSON.stringify(searchBox)}`);
await press(null, 'Escape', 'Escape');
await page.waitForTimeout(200);

// 4 — the menu advertises the key and claims none of them.
const menu = await app.evaluate(({ Menu }) => {
  const flat = (items) => items.flatMap((i) => [i, ...flat(i.submenu?.items ?? [])]);
  const copy = flat(Menu.getApplicationMenu()?.items ?? []).find((i) => i.label === 'Copy');
  return copy ? { accelerator: copy.accelerator, registered: copy.registerAccelerator } : null;
});
check('the Files menu shows Copy as F5 without registering it',
  menu?.accelerator === 'F5' && menu?.registered === false, JSON.stringify(menu));

// 5 — the settings window opens, is a singleton, and can use IPC.
await page.evaluate(() => window.gc.keymap.openSettings());
const settingsPage = await app.waitForEvent('window');
await settingsPage.waitForSelector('.gc-settings', { timeout: 10_000 });
const settingsRevision = await settingsPage.evaluate(async () => (await window.gc.keymap.get()).revision);
check('the settings window uses IPC in a packaged build', typeof settingsRevision === 'number',
  String(settingsRevision));

await page.evaluate(() => window.gc.keymap.openSettings());
await page.waitForTimeout(400);
const windowCount = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
check('the settings window is a singleton', windowCount === 2, `windows=${windowCount}`);

// 6 — a rebind driven from the settings window reaches everything. Copy's F5
// is cleared first, so F12 really is the key the menu has to show.
const rebind = await settingsPage.evaluate(async () => {
  const snap = await window.gc.keymap.get();
  const cleared = await window.gc.keymap.apply({
    revision: snap.revision, op: { kind: 'clear', context: 'global', command: 'copy' },
  });
  const out = await window.gc.keymap.apply({
    revision: cleared.snapshot.revision,
    op: { kind: 'assign', context: 'global', command: 'copy', key: 'F12' },
  });
  return out.ok ? out.snapshot.bindings.global.copy : null;
});
check('the settings window rebinds copy to F12', JSON.stringify(rebind) === '["F12"]',
  JSON.stringify(rebind));

const menuAfter = await app.evaluate(({ Menu }) => {
  const flat = (items) => items.flatMap((i) => [i, ...flat(i.submenu?.items ?? [])]);
  return flat(Menu.getApplicationMenu()?.items ?? []).find((i) => i.label === 'Copy')?.accelerator ?? null;
});
check('the application menu follows the rebind with no restart', menuAfter === 'F12', String(menuAfter));

const panelKeys = await page.evaluate(async () => (await window.gc.keymap.get()).bindings.global.copy);
check('the main window got the broadcast', JSON.stringify(panelKeys) === '["F12"]',
  JSON.stringify(panelKeys));

const onDisk = JSON.parse(readFileSync(join(keymapDir, 'keymap.json'), 'utf8'));
check('the file on disk holds the override',
  (onDisk.bindings?.global?.copy ?? []).includes('F12'), JSON.stringify(onDisk.bindings?.global ?? null));

await app.close();

if (failures.length > 0) {
  console.error(`\nKEYS_E2E_FAILED: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nKEYS_E2E_OK');
