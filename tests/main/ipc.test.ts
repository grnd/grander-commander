import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { OpEvent } from '@shared/types';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const statMock = vi.fn();
let isPackaged = true;

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return isPackaged;
    },
  },
  BrowserWindow: {
    fromWebContents: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
  },
  shell: {
    openPath: vi.fn(),
  },
}));

vi.mock('@main/fs/listDir', () => ({ listDir: vi.fn() }));
vi.mock('@main/fs/stat', () => ({ stat: statMock }));
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
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  getUpdateStatus: vi.fn(),
}));
vi.mock('@main/shell/terminal', () => ({
  spawnTerminal: vi.fn(),
  writeTerminal: vi.fn(),
  resizeTerminal: vi.fn(),
  killTerminal: vi.fn(),
  killAllForContents: vi.fn(),
}));
vi.mock('@main/menu/fileContext', () => ({
  popupFileContext: vi.fn(),
}));

describe('ipc validation and trust checks', () => {
  beforeEach(() => {
    handlers.clear();
    statMock.mockReset();
    vi.resetModules();
    isPackaged = true;
    delete process.env.ELECTRON_RENDERER_URL;
  });

  it('accepts only the exact configured dev origin', async () => {
    process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:5173/app';
    isPackaged = false;
    const { isTrustedRendererUrl } = await import('@main/ipc');

    expect(isTrustedRendererUrl('http://127.0.0.1:5173/other')).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5173/other')).toBe(false);
    expect(isTrustedRendererUrl('https://127.0.0.1:5173/other')).toBe(false);
  });

  it('accepts the packaged renderer file URL and rejects sibling files', async () => {
    isPackaged = true;
    const { isTrustedRendererUrl } = await import('@main/ipc');
    const rendererUrl = pathToFileURL(join(process.cwd(), 'src/renderer/index.html')).toString();
    const siblingUrl = pathToFileURL(join(process.cwd(), 'src/renderer/other.html')).toString();

    expect(isTrustedRendererUrl(rendererUrl)).toBe(true);
    expect(isTrustedRendererUrl(siblingUrl)).toBe(false);
  });

  it('rejects remote renderer origins in packaged builds even if ELECTRON_RENDERER_URL is set', async () => {
    process.env.ELECTRON_RENDERER_URL = 'https://evil.example/app';
    isPackaged = true;
    const { isTrustedRendererUrl } = await import('@main/ipc');

    expect(isTrustedRendererUrl('https://evil.example/other')).toBe(false);
  });

  it('validates file-context and file-op payloads', async () => {
    const {
      validateConflictAnswerPayload,
      validateFileContextArgs,
      validateFileOpPayload,
    } = await import('@main/ipc');

    expect(validateFileContextArgs({
      x: 10,
      y: 20,
      fullPath: '/tmp/file',
      isDir: false,
      isDotDot: false,
      isAppBundle: false,
    })).toEqual({
      x: 10,
      y: 20,
      fullPath: '/tmp/file',
      isDir: false,
      isDotDot: false,
      isAppBundle: false,
    });
    expect(() => validateFileContextArgs({ x: 1.5 })).toThrow(/args\.x must be an integer/);

    expect(validateFileOpPayload({
      kind: 'copy',
      sources: ['/tmp/a'],
      dst: '/tmp/b',
    })).toEqual({
      kind: 'copy',
      sources: ['/tmp/a'],
      dst: '/tmp/b',
    });
    expect(() => validateFileOpPayload({ kind: 'delete', sources: [], dst: '/tmp' }))
      .toThrow(/op\.kind must be copy or move/);

    expect(validateConflictAnswerPayload({ action: 'rename', newName: 'renamed.txt' }))
      .toEqual({ action: 'rename', newName: 'renamed.txt', applyToAll: false });
    expect(() => validateConflictAnswerPayload({ action: 'skip', applyToAll: 'yes' }))
      .toThrow(/answer\.applyToAll must be a boolean/);
  });

  it('rejects untrusted IPC senders before privileged handlers run', async () => {
    const { registerIpc } = await import('@main/ipc');
    statMock.mockResolvedValue({ ok: true, value: null });
    registerIpc();

    const handler = handlers.get('fs:stat');
    expect(handler).toBeTypeOf('function');

    expect(() => handler?.({
      senderFrame: { url: 'https://evil.example/' },
      sender: {},
    }, '/tmp/file')).toThrow(/Untrusted IPC sender/);
    expect(statMock).not.toHaveBeenCalled();
  });

  it('allows trusted IPC senders through to privileged handlers', async () => {
    const { registerIpc } = await import('@main/ipc');
    statMock.mockResolvedValue({ ok: true, value: { name: 'file' } });
    registerIpc();

    const handler = handlers.get('fs:stat');
    const trustedUrl = pathToFileURL(join(process.cwd(), 'src/renderer/index.html')).toString();
    await expect(handler?.({
      senderFrame: { url: trustedUrl },
      sender: {},
    }, '/tmp/file')).resolves.toEqual({ ok: true, value: { name: 'file' } });
    expect(statMock).toHaveBeenCalledWith('/tmp/file');
  });

  it('buffers op events until subscribe readiness, enforces ownership, and cleans up on unsubscribe', async () => {
    const { registerIpc, runner } = await import('@main/ipc');
    registerIpc();

    const runnerUnsubscribe = vi.fn();
    let runnerListener: ((event: OpEvent) => void) | null = null;
    vi.spyOn(runner, 'start').mockReturnValue('op-fast');
    vi.spyOn(runner, 'subscribe').mockImplementation((_id, cb) => {
      runnerListener = cb;
      return runnerUnsubscribe;
    });
    const cancelSpy = vi.spyOn(runner, 'cancel').mockImplementation(() => {});

    const trustedUrl = pathToFileURL(join(process.cwd(), 'src/renderer/index.html')).toString();
    let destroyed: (() => void) | null = null;
    const owner = {
      id: 7,
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      once: vi.fn((_event: string, cb: () => void) => { destroyed = cb; }),
    };
    const intruder = {
      id: 8,
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
    };

    const startHandler = handlers.get('ops:start');
    const subscribeHandler = handlers.get('ops:subscribe');
    const unsubscribeHandler = handlers.get('ops:unsubscribe');
    const cancelHandler = handlers.get('ops:cancel');

    expect(startHandler).toBeTypeOf('function');
    expect(subscribeHandler).toBeTypeOf('function');
    expect(unsubscribeHandler).toBeTypeOf('function');
    expect(cancelHandler).toBeTypeOf('function');

    expect(startHandler?.({
      senderFrame: { url: trustedUrl },
      sender: owner,
    }, { kind: 'copy', sources: [], dst: '/tmp/out' })).toBe('op-fast');

    runnerListener?.({ kind: 'complete', filesDone: 0, bytesDone: 0 });
    expect(owner.send).not.toHaveBeenCalled();

    expect(() => subscribeHandler?.({
      senderFrame: { url: trustedUrl },
      sender: intruder,
    }, 'op-fast')).toThrow(/different renderer/);

    expect(() => cancelHandler?.({
      senderFrame: { url: trustedUrl },
      sender: intruder,
    }, 'op-fast')).toThrow(/different renderer/);
    expect(cancelSpy).not.toHaveBeenCalled();

    expect(subscribeHandler?.({
      senderFrame: { url: trustedUrl },
      sender: owner,
    }, 'op-fast')).toBeUndefined();
    expect(owner.send).toHaveBeenCalledWith('ops:event:op-fast', {
      kind: 'complete',
      filesDone: 0,
      bytesDone: 0,
    });

    expect(unsubscribeHandler?.({
      senderFrame: { url: trustedUrl },
      sender: owner,
    }, 'op-fast')).toBeUndefined();
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(cancelSpy).toHaveBeenLastCalledWith('op-fast');
    expect(runnerUnsubscribe).toHaveBeenCalledTimes(1);

    owner.send.mockClear();
    runnerListener?.({ kind: 'complete', filesDone: 0, bytesDone: 0 });
    expect(owner.send).not.toHaveBeenCalled();

    expect(startHandler?.({
      senderFrame: { url: trustedUrl },
      sender: owner,
    }, { kind: 'copy', sources: ['/tmp/a'], dst: '/tmp/out' })).toBe('op-fast');
    destroyed?.();
    expect(cancelSpy).toHaveBeenCalledTimes(2);
    expect(cancelSpy).toHaveBeenLastCalledWith('op-fast');
    expect(runnerUnsubscribe).toHaveBeenCalledTimes(2);
  });
});
