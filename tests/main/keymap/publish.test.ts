import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  Menu: { buildFromTemplate: vi.fn((t) => t), setApplicationMenu: vi.fn() },
}));
vi.mock('@main/updater', () => ({ checkForUpdates: vi.fn() }));

import { publishKeymap } from '@main/keymap/publish';
import { defaultBindings } from '@shared/commands/catalog';
import type { KeymapSnapshot } from '@shared/keymap/types';

const snapshot = (bindings = defaultBindings(), revision = 1): KeymapSnapshot =>
  ({ revision, bindings, overrides: {}, diagnostics: [], readOnly: false });

type Item = { label?: string; accelerator?: string; submenu?: Item[] };
const flat = (items: Item[]): Item[] =>
  items.flatMap((i) => [i, ...flat(i.submenu ?? [])]);

describe('publishKeymap', () => {
  it('rebuilds the application menu from the committed bindings', () => {
    const setApplicationMenu = vi.fn();
    const base = defaultBindings();
    publishKeymap(snapshot({ ...base, global: { ...base.global, copy: ['F12'] } }),
      { setApplicationMenu, windows: () => [] });

    const template = setApplicationMenu.mock.calls[0][0] as Item[];
    expect(flat(template).find((i) => i.label === 'Copy')?.accelerator).toBe('F12');
  });

  it('sends the snapshot to every window', () => {
    const send = vi.fn();
    publishKeymap(snapshot(), {
      setApplicationMenu: vi.fn(),
      windows: () => ([{ webContents: { send } }, { webContents: { send } }] as never),
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith('keymap:changed', expect.objectContaining({ revision: 1 }));
  });
});
