import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';

const electronMocks = vi.hoisted(() => {
  const popup = vi.fn();
  const buildFromTemplate = vi.fn((items: MenuItemConstructorOptions[]) => ({ popup, items }));
  return { popup, buildFromTemplate };
});

vi.mock('electron', () => ({
  BrowserWindow: class {},
  Menu: { buildFromTemplate: electronMocks.buildFromTemplate },
  shell: { showItemInFolder: vi.fn() },
}));

vi.mock('../../../src/main/shell/openWith', () => ({
  openDefault: vi.fn(),
  openWithChooser: vi.fn(),
}));

import { popupFileContext } from '@main/menu/fileContext';
import { defaultBindings } from '@shared/commands/catalog';

describe('popupFileContext', () => {
  beforeEach(() => {
    electronMocks.popup.mockReset();
    electronMocks.buildFromTemplate.mockClear();
  });

  it('sends the clicked folder path with Add to Favorites', () => {
    const send = vi.fn();
    const win = { webContents: { send } } as never;

    popupFileContext(win, {
      x: 10,
      y: 20,
      fullPath: '/tmp/photos',
      isDir: true,
      isDotDot: false,
      isAppBundle: false,
    });

    const template = electronMocks.buildFromTemplate.mock.calls[0]?.[0] ?? [];
    const addToFavorites = template.find((item) => item.label === 'Add to Favorites');
    expect(addToFavorites).toBeTruthy();
    addToFavorites?.click?.(undefined as never, undefined as never, undefined as never);

    expect(send).toHaveBeenCalledWith('menu:command', {
      command: 'addToFavorites',
      targetPath: '/tmp/photos',
    });
  });
});

describe('context menu accelerators', () => {
  const items = (): MenuItemConstructorOptions[] => {
    popupFileContext({ webContents: { send: vi.fn() } } as never, {
      x: 0, y: 0, fullPath: '/tmp/a.txt', isDir: false, isDotDot: false, isAppBundle: false,
    });
    const call = electronMocks.buildFromTemplate.mock.calls.at(-1);
    return call![0] as MenuItemConstructorOptions[];
  };

  // D5: the item sent deleteCursorConfirm — this one file — while advertising
  // Shift+F8, which is deleteConfirm, the whole selection.
  it('advertises the key that does what the item does', () => {
    const perm = items().find((i) => i.label === 'Delete Permanently…');
    expect(perm?.accelerator).toBe('Cmd+Backspace');
  });

  it('registers none of its accelerators', () => {
    for (const i of items()) {
      if (i.accelerator) {
        expect(i.registerAccelerator, `${i.label} must not claim its key`).toBe(false);
      }
    }
  });

  it('shows the keys its commands are bound to', () => {
    const labelled = Object.fromEntries(items().filter((i) => i.label).map((i) => [i.label, i.accelerator]));
    expect(labelled['Copy']).toBe('F5');
    expect(labelled['Move']).toBe('F6');
    expect(labelled['Rename']).toBe('F2');
    expect(labelled['Move to Trash']).toBe('F8');
  });
});

describe('the context menu follows the keymap', () => {
  it('shows the key the live keymap holds, not the default', () => {
    const base = defaultBindings();
    popupFileContext({ webContents: { send: vi.fn() } } as never, {
      x: 0, y: 0, fullPath: '/tmp/a.txt', isDir: false, isDotDot: false, isAppBundle: false,
    }, { ...base, global: { ...base.global, copy: ['F12'] } });
    const items = electronMocks.buildFromTemplate.mock.calls.at(-1)![0] as MenuItemConstructorOptions[];
    expect(items.find((i) => i.label === 'Copy')?.accelerator).toBe('F12');
  });
});
