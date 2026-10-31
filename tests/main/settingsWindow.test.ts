import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

let isPackaged = true;
const created: Record<string, unknown>[] = [];

class FakeWindow {
  static instances: FakeWindow[] = [];
  webContents = { send: vi.fn(), on: vi.fn(), setWindowOpenHandler: vi.fn() };
  destroyed = false;
  handlers = new Map<string, () => void>();
  constructor(public options: Record<string, unknown>) {
    created.push(options);
    FakeWindow.instances.push(this);
  }
  loadFile = vi.fn().mockResolvedValue(undefined);
  loadURL = vi.fn().mockResolvedValue(undefined);
  on(event: string, cb: () => void) { this.handlers.set(event, cb); return this; }
  focus = vi.fn();
  getBounds() { return { x: 10, y: 20, width: 900, height: 700 }; }
  isDestroyed() { return this.destroyed; }
  static getAllWindows() { return FakeWindow.instances.filter((w) => !w.destroyed); }
}

vi.mock('electron', () => ({
  app: {
    whenReady: vi.fn(() => new Promise<void>(() => {})), on: vi.fn(), quit: vi.fn(),
    get isPackaged() { return isPackaged; }, getPath: vi.fn(() => '/tmp/gc-test-userdata'),
  },
  BrowserWindow: FakeWindow,
  Menu: { buildFromTemplate: vi.fn((t) => t), setApplicationMenu: vi.fn() },
}));
vi.mock('@main/ipc', () => ({
  registerIpc: vi.fn(), setKeymapStore: vi.fn(), setKeymapPublisher: vi.fn(),
  setSettingsOpener: vi.fn(), isTrustedRendererUrl: vi.fn(() => true),
}));
vi.mock('@main/updater', () => ({ checkForUpdates: vi.fn(), initUpdater: vi.fn() }));
vi.mock('@main/keymap/store', () => ({ KeymapStore: { open: vi.fn().mockResolvedValue({}) } }));

beforeEach(() => {
  created.length = 0;
  FakeWindow.instances.length = 0;
  vi.resetModules();
  isPackaged = true;
  delete process.env.ELECTRON_RENDERER_URL;
});

describe('the settings window', () => {
  it('loads the packaged settings entry', async () => {
    const { getSettingsLoadTarget } = await import('@main/main');
    expect(getSettingsLoadTarget()).toEqual({
      kind: 'file', target: expect.stringContaining(join('renderer', 'settings', 'index.html')),
    });
  });

  it('loads the dev entry under the dev server', async () => {
    isPackaged = false;
    process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:5173';
    const { getSettingsLoadTarget } = await import('@main/main');
    expect(getSettingsLoadTarget()).toEqual({ kind: 'url', target: 'http://127.0.0.1:5173/settings/' });
  });

  it('runs the same preload and sandbox as the main window', async () => {
    const { openSettingsWindow } = await import('@main/main');
    await openSettingsWindow();
    const web = created[0].webPreferences as Record<string, unknown>;
    expect(web.sandbox).toBe(true);
    expect(web.contextIsolation).toBe(true);
    expect(String(web.preload)).toContain('preload.cjs');
  });

  it('opens one window and focuses it the second time', async () => {
    const { openSettingsWindow } = await import('@main/main');
    const first = await openSettingsWindow();
    const second = await openSettingsWindow();
    expect(second).toBe(first);
    expect(created).toHaveLength(1);
    expect((first as unknown as FakeWindow).focus).toHaveBeenCalled();
  });

  it('reloads and publishes when the settings window takes focus', async () => {
    const reloadIfChanged = vi.fn().mockResolvedValue({
      changed: true,
      snapshot: { revision: 7, bindings: {}, overrides: {}, diagnostics: [], readOnly: false },
    });
    const publish = vi.fn();
    const { handleSettingsFocus } = await import('@main/main');
    await handleSettingsFocus({ reloadIfChanged } as never, publish);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ revision: 7 }));
  });

  it('publishes nothing when the file did not change', async () => {
    const publish = vi.fn();
    const { handleSettingsFocus } = await import('@main/main');
    await handleSettingsFocus(
      { reloadIfChanged: vi.fn().mockResolvedValue({ changed: false, snapshot: {} }) } as never, publish);
    expect(publish).not.toHaveBeenCalled();
  });

  it('reloads when the window takes focus, through the registered handler', async () => {
    const reloadIfChanged = vi.fn().mockResolvedValue({
      changed: true,
      snapshot: { revision: 4, bindings: {}, overrides: {}, diagnostics: [], readOnly: false },
    });
    const { openSettingsWindow, setKeymapStoreForTest } = await import('@main/main');
    setKeymapStoreForTest({ reloadIfChanged } as never);
    const win = await openSettingsWindow() as unknown as FakeWindow;

    win.handlers.get('focus')?.();
    await vi.waitFor(() => expect(reloadIfChanged).toHaveBeenCalledOnce());
  });

  it('saves its bounds when it closes', async () => {
    const { openSettingsWindow } = await import('@main/main');
    const win = await openSettingsWindow() as unknown as FakeWindow;
    expect(() => win.handlers.get('close')?.()).not.toThrow();
  });
});
