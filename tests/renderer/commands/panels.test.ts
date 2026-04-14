import { describe, it, expect, vi } from 'vitest';
import { swapPanels, switchActive, sameDirToOther } from '@renderer/commands/panels';
import { initialPanelState } from '@renderer/state/panelSlice';

const mkStore = () => {
  let state = {
    panels: { left: initialPanelState('/a'), right: initialPanelState('/b') },
    activeSide: 'left' as const,
  };
  const get = () => state;
  const set = vi.fn((patch: Partial<typeof state>) => { state = { ...state, ...patch }; });
  return { get, set, state };
};

describe('swapPanels', () => {
  it('swaps left and right panels', async () => {
    const s = mkStore();
    await swapPanels({ get: s.get, set: s.set });
    const patch = s.set.mock.calls[0][0];
    expect(patch.panels.left.path).toBe('/b');
    expect(patch.panels.right.path).toBe('/a');
  });
});

describe('switchActive', () => {
  it('flips activeSide', async () => {
    const s = mkStore();
    await switchActive({ get: s.get, set: s.set });
    expect(s.set.mock.calls[0][0].activeSide).toBe('right');
  });
});

describe('sameDirToOther', () => {
  it('copies active panel path to the inactive panel (triggers loadDir via api)', async () => {
    const s = mkStore();
    const api = { fs: { listDir: vi.fn().mockResolvedValue({ ok: true, value: [] }) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sameDirToOther({ get: s.get, set: s.set, api: api as any });
    expect(api.fs.listDir).toHaveBeenCalledWith('/a', expect.objectContaining({ showHidden: false }));
  });
});
