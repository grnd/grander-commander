import { beforeEach, describe, expect, it, vi } from 'vitest';

let isPackaged = true;

const appMock = {
  whenReady: vi.fn(() => new Promise<void>(() => {})),
  on: vi.fn(),
  quit: vi.fn(),
  get isPackaged() {
    return isPackaged;
  },
};

vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: vi.fn(),
  Menu: {
    buildFromTemplate: vi.fn((template) => template),
    setApplicationMenu: vi.fn(),
  },
}));

vi.mock('@main/ipc', () => ({
  registerIpc: vi.fn(),
}));

vi.mock('@main/updater', () => ({
  checkForUpdates: vi.fn(),
  initUpdater: vi.fn(),
}));

describe('main window guards and menu', () => {
  beforeEach(() => {
    isPackaged = true;
    vi.resetModules();
    delete process.env.ELECTRON_RENDERER_URL;
  });

  it('wires Toggle Hidden Files to the renderer command', async () => {
    const { buildMenuTemplate } = await import('@main/main');
    const template = buildMenuTemplate();
    const showMenu = template.find((item) => item.label === 'Show');
    expect(showMenu && 'submenu' in showMenu ? showMenu.submenu : undefined).toBeTruthy();

    const hiddenItem = (showMenu!.submenu as Electron.MenuItemConstructorOptions[])
      .find((item) => item.label === 'Toggle Hidden Files');
    const send = vi.fn();
    hiddenItem!.click?.({} as never, { webContents: { send } } as never, {} as never);

    expect(send).toHaveBeenCalledWith('menu:command', 'toggleHidden');
  });

  // macOS performs clipboard editing through the menu bar, so a text field
  // cannot paste unless a menu item claims Cmd+V. Losing this submenu breaks
  // pasting into every dialog in the app, silently.
  describe('Edit menu', () => {
    const editItems = async () => {
      const { buildMenuTemplate } = await import('@main/main');
      const edit = buildMenuTemplate().find((item) => item.label === 'Edit');
      expect(edit, 'the Edit submenu must exist').toBeTruthy();
      return edit!.submenu as Electron.MenuItemConstructorOptions[];
    };

    it('claims paste, so text fields can paste', async () => {
      const paste = (await editItems()).find((item) => item.role === 'paste');
      expect(paste).toBeTruthy();
      expect(paste!.registerAccelerator).not.toBe(false);
    });

    it('offers undo and redo', async () => {
      const roles = (await editItems()).map((item) => item.role);
      expect(roles).toContain('undo');
      expect(roles).toContain('redo');
    });

    // Cmd+X, Cmd+C and Cmd+A move, copy and select *files*. The menu shows
    // these items but must not take their keys away from the panels.
    it('never registers the accelerators the panels use', async () => {
      const items = await editItems();
      for (const role of ['cut', 'copy', 'selectAll'] as const) {
        const item = items.find((i) => i.role === role);
        expect(item, `${role} should still be listed`).toBeTruthy();
        expect(item!.registerAccelerator, `${role} must not claim its accelerator`).toBe(false);
      }
    });
  });

  // On macOS the application menu is process-wide: AppKit intercepts a
  // registered accelerator before any window sees the key. A menu item that
  // claims a key therefore makes per-context keymaps impossible, so every
  // custom item displays its key and registers none of them.
  describe('accelerators', () => {
    type Item = Electron.MenuItemConstructorOptions;
    const flat = (items: readonly Item[]): Item[] =>
      items.flatMap((i) => [i, ...flat((i.submenu as Item[] | undefined) ?? [])]);
    const byLabel = async (label: string, bindings?: unknown) => {
      const { buildMenuTemplate } = await import('@main/main');
      return flat(buildMenuTemplate(bindings as never)).find((i) => i.label === label);
    };

    it('shows the bound key but never registers it', async () => {
      const copy = await byLabel('Copy');
      expect(copy?.accelerator).toBe('F5');
      expect(copy?.registerAccelerator).toBe(false);
    });

    it('follows the keymap it is given', async () => {
      const { defaultBindings } = await import('@shared/commands/catalog');
      const base = defaultBindings();
      const copy = await byLabel('Copy', { ...base, global: { ...base.global, copy: ['Cmd+Shift+C'] } });
      expect(copy?.accelerator).toBe('Cmd+Shift+C');
    });

    it('shows no accelerator for a command with no bindings', async () => {
      const { defaultBindings } = await import('@shared/commands/catalog');
      const base = defaultBindings();
      const copy = await byLabel('Copy', { ...base, global: { ...base.global, copy: [] } });
      expect(copy?.accelerator).toBeUndefined();
    });

    it('keeps the system roles that must own their keys', async () => {
      const { buildMenuTemplate } = await import('@main/main');
      const roles = flat(buildMenuTemplate()).map((i) => i.role).filter(Boolean);
      expect(roles).toContain('quit');
      expect(roles).toContain('paste');
      // The reload role shadowed Cmd+R refresh with a developer convenience.
      expect(roles).not.toContain('reload');
    });
  });

  it('denies navigation and window opens in production', async () => {
    const { installProductionWindowGuards } = await import('@main/main');
    const preventDefault = vi.fn();
    const on = vi.fn();
    const setWindowOpenHandler = vi.fn();

    installProductionWindowGuards({
      webContents: { on, setWindowOpenHandler },
    } as never);

    expect(on).toHaveBeenCalledWith('will-navigate', expect.any(Function));
    const handler = on.mock.calls[0]?.[1] as (event: { preventDefault: () => void }) => void;
    handler({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(setWindowOpenHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(setWindowOpenHandler.mock.calls[0]?.[0]()).toEqual({ action: 'deny' });
  });

  it('skips production-only window guards in development', async () => {
    isPackaged = false;
    const { installProductionWindowGuards } = await import('@main/main');
    const on = vi.fn();
    const setWindowOpenHandler = vi.fn();

    installProductionWindowGuards({
      webContents: { on, setWindowOpenHandler },
    } as never);

    expect(on).not.toHaveBeenCalled();
    expect(setWindowOpenHandler).not.toHaveBeenCalled();
  });

  it('uses the dev server only for unpackaged builds', async () => {
    process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:5173/app';
    isPackaged = false;
    const { getRendererLoadTarget } = await import('@main/main');

    expect(getRendererLoadTarget()).toEqual({
      kind: 'url',
      target: 'http://127.0.0.1:5173/app',
    });
  });

  it('ignores ELECTRON_RENDERER_URL in packaged builds', async () => {
    process.env.ELECTRON_RENDERER_URL = 'https://evil.example/app';
    isPackaged = true;
    const { getRendererLoadTarget } = await import('@main/main');

    expect(getRendererLoadTarget()).toEqual({
      kind: 'file',
      target: expect.stringContaining('/renderer/index.html'),
    });
  });
});
