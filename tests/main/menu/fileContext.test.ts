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
