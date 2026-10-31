import { vi } from 'vitest';
import { defaultBindings } from '@shared/commands/catalog';
import type { Bindings } from '@shared/keymap/lookup';
import type { KeymapSnapshot } from '@shared/keymap/types';

/** A committed snapshot, for a test that wants to hand one to the renderer. */
export function snapshotOf(bindings: Bindings = defaultBindings(), revision = 1): KeymapSnapshot {
  return { revision, bindings, overrides: {}, diagnostics: [], readOnly: false };
}

/**
 * The keymap half of `window.gc`. Every App test spreads this into its own
 * fixture, because App hydrates the keymap on mount and a missing member
 * would crash the mount.
 */
export function keymapApi() {
  return {
    get: vi.fn().mockResolvedValue(snapshotOf()),
    apply: vi.fn(),
    undo: vi.fn(),
    setCapture: vi.fn().mockResolvedValue({ capturing: false }),
    onChanged: vi.fn(() => () => {}),
    openSettings: vi.fn().mockResolvedValue(undefined),
  };
}
