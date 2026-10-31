import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  Menu: { buildFromTemplate: vi.fn((t) => t), setApplicationMenu: vi.fn() },
}));
vi.mock('@main/updater', () => ({ checkForUpdates: vi.fn() }));

beforeEach(() => vi.resetModules());

// The other half of capture mode: while the settings window records a key, a
// menu click must not act on the main window behind it.
describe('menu commands during capture', () => {
  it('drops a menu command while a key is being recorded', async () => {
    const { sendMenuCommand } = await import('@main/menuTemplate');
    const { setCapturing } = await import('@main/capture');
    const send = vi.fn();

    setCapturing(true);
    sendMenuCommand({ webContents: { send } } as never, 'trash');
    expect(send).not.toHaveBeenCalled();

    setCapturing(false);
    sendMenuCommand({ webContents: { send } } as never, 'trash');
    expect(send).toHaveBeenCalledWith('menu:command', 'trash');
  });
});
