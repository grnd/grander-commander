import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
let isPackaged = true;

vi.mock('electron', () => ({
  app: { get isPackaged() { return isPackaged; }, getPath: () => tmpdir(), quit: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(), getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn((c: string, h: (...a: unknown[]) => unknown) => { handlers.set(c, h); }) },
  shell: { openPath: vi.fn() },
  Menu: { buildFromTemplate: vi.fn((t) => t), setApplicationMenu: vi.fn() },
}));
vi.mock('@main/fs/listDir', () => ({ listDir: vi.fn() }));
vi.mock('@main/fs/stat', () => ({ stat: vi.fn() }));
vi.mock('@main/volumes/list', () => ({ listVolumes: vi.fn() }));
vi.mock('@main/fs/mkdir', () => ({ mkdir: vi.fn() }));
vi.mock('@main/fs/rename', () => ({ rename: vi.fn() }));
vi.mock('@main/fs/trash', () => ({ trashPaths: vi.fn() }));
vi.mock('@main/fs/delete', () => ({ deletePaths: vi.fn() }));
vi.mock('@main/fs/duplicate', () => ({ duplicate: vi.fn() }));
vi.mock('@main/shell/quickLook', () => ({ quickLook: vi.fn() }));
vi.mock('@main/shell/openTerminal', () => ({ openTerminal: vi.fn() }));
vi.mock('@main/shell/runCommand', () => ({ runCommand: vi.fn() }));
vi.mock('@main/updater', () => ({
  checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn(), getUpdateStatus: vi.fn(),
}));
vi.mock('@main/shell/terminal', () => ({
  spawnTerminal: vi.fn(), writeTerminal: vi.fn(), resizeTerminal: vi.fn(),
  killTerminal: vi.fn(), killAllForContents: vi.fn(),
}));
vi.mock('@main/menu/fileContext', () => ({ popupFileContext: vi.fn() }));

const sender = () => ({
  senderFrame: { url: pathToFileURL(join(process.cwd(), 'src/renderer/index.html')).toString() },
  sender: {},
});

let dir = '';
const start = async () => {
  const { KeymapStore } = await import('@main/keymap/store');
  const { registerIpc, setKeymapStore, setKeymapPublisher, setSettingsOpener } = await import('@main/ipc');
  dir = mkdtempSync(join(tmpdir(), 'gc-ipc-'));
  const store = await KeymapStore.open(dir);
  const published: { revision: number }[] = [];
  const opened = vi.fn();
  setKeymapStore(store);
  setKeymapPublisher((s) => published.push(s));
  setSettingsOpener(opened);
  registerIpc();
  return { store, published, opened };
};

beforeEach(() => { handlers.clear(); vi.resetModules(); isPackaged = true; });

describe('keymap IPC', () => {
  it('serves the resolved keymap', async () => {
    await start();
    expect(await handlers.get('keymap:get')!(sender())).toMatchObject({ revision: 1, readOnly: false });
  });

  it('applies an op from one object and publishes the result', async () => {
    const { published } = await start();
    const out = await handlers.get('keymap:apply')!(sender(), {
      revision: 1, op: { kind: 'assign', context: 'global', command: 'rename', key: 'F5' },
    }) as { ok: boolean; displaced: unknown[] };
    expect(out.ok).toBe(true);
    expect(out.displaced).toEqual([{ context: 'global', command: 'copy', key: 'F5' }]);
    expect(published).toHaveLength(1);
  });

  // Review Focus 2: a refusal must publish the snapshot it rebased onto, or the
  // windows stay a revision behind for good.
  it('publishes the current snapshot when it refuses an edit', async () => {
    const { store, published } = await start();
    writeFileSync(join(dir, 'keymap.json'),
      JSON.stringify({ version: 1, bindings: { global: { move: ['F11'] } } }));

    const out = await handlers.get('keymap:apply')!(sender(), {
      revision: store.snapshot().revision,
      op: { kind: 'assign', context: 'global', command: 'copy', key: 'F12' },
    }) as { ok: boolean; reason: string; snapshot: { revision: number } };
    expect(out).toMatchObject({ ok: false, reason: 'external-change' });
    expect(published.at(-1)).toMatchObject({ revision: out.snapshot.revision });
  });

  it('undoes through its token', async () => {
    await start();
    const first = await handlers.get('keymap:apply')!(sender(), {
      revision: 1, op: { kind: 'assign', context: 'global', command: 'rename', key: 'F5' },
    }) as { ok: true; snapshot: { revision: number }; undoToken: string };
    const out = await handlers.get('keymap:undo')!(sender(), {
      revision: first.snapshot.revision, token: first.undoToken,
    }) as { ok: boolean };
    expect(out.ok).toBe(true);
  });

  it('rejects an op that is not a known shape', async () => {
    await start();
    for (const op of [
      { kind: 'assign', context: 'nope', command: 'copy', key: 'F12' },
      { kind: 'assign', context: 'global', command: 'copy', key: 'Cmd+/' },
      { kind: 'nonsense' },
      'assign',
    ]) {
      await expect(Promise.resolve().then(() =>
        handlers.get('keymap:apply')!(sender(), { revision: 1, op }))).rejects.toThrow();
    }
  });

  it('carries the capture flag into the menu suppression', async () => {
    await start();
    const { menuCommandsSuppressed } = await import('@main/capture');
    await handlers.get('keymap:setCapture')!(sender(), { capturing: true });
    expect(menuCommandsSuppressed()).toBe(true);
    await handlers.get('keymap:setCapture')!(sender(), { capturing: false });
    expect(menuCommandsSuppressed()).toBe(false);
  });

  it('rejects an untrusted sender before it touches the store', async () => {
    await start();
    expect(() => handlers.get('keymap:apply')!(
      { senderFrame: { url: 'https://evil.example/' }, sender: {} },
      { revision: 1, op: { kind: 'resetAll' } })).toThrow(/Untrusted IPC sender/);
  });

  it('opens the settings window through the injected opener', async () => {
    const { opened } = await start();
    await handlers.get('app:openSettings')!(sender());
    expect(opened).toHaveBeenCalledOnce();
  });

  it('trusts the packaged settings entry as well as the main one', async () => {
    const { isTrustedRendererUrl } = await import('@main/ipc');
    const url = (p: string) => pathToFileURL(join(process.cwd(), p)).toString();
    expect(isTrustedRendererUrl(url('src/renderer/index.html'))).toBe(true);
    expect(isTrustedRendererUrl(url('src/renderer/settings/index.html'))).toBe(true);
    expect(isTrustedRendererUrl(url('src/renderer/other.html'))).toBe(false);
  });
});
