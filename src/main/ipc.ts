import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listDir } from './fs/listDir';
import { stat } from './fs/stat';
import { listVolumes } from './volumes/list';
import { mkdir } from './fs/mkdir';
import { rename } from './fs/rename';
import { trashPaths } from './fs/trash';
import { deletePaths } from './fs/delete';
import { duplicate } from './fs/duplicate';
import { quickLook } from './shell/quickLook';
import { openTerminal } from './shell/openTerminal';
import { runCommand } from './shell/runCommand';
import { checkForUpdates, downloadUpdate, quitAndInstall, getUpdateStatus, openReleaseNotes } from './updater';
import { spawnTerminal, writeTerminal, resizeTerminal, killTerminal, killAllForContents } from './shell/terminal';
import { popupFileContext, type FileContextArgs } from './menu/fileContext';
import { OpRunner } from './ops/runner';
import type { ConflictAnswer, FileOp, ListDirOptions, OpEvent, OpId } from '@shared/types';

const runner = new OpRunner();
type OpBridge = {
  owner: WebContents;
  ready: boolean;
  buffer: OpEvent[];
  runnerUnsubscribe: () => void;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
};

const MAX_PATH_LENGTH = 4096;
const MAX_BASENAME_LENGTH = 255;
const MAX_PATHS_PER_REQUEST = 1024;
const MAX_COMMAND_LENGTH = 8000;
const MAX_TERMINAL_DATA_LENGTH = 64_000;
const MAX_TERMINAL_DIMENSION = 1000;
const MAX_MENU_COORDINATE = 100_000;
const MAX_BUFFERED_OP_EVENTS = 32;
const OP_BRIDGE_RETENTION_MS = 5_000;

const opBridges = new Map<OpId, OpBridge>();
const ownerOpIds = new Map<number, Set<OpId>>();
const watchedOpOwners = new Set<number>();

function expectedPackagedRendererUrl(): URL {
  return pathToFileURL(join(__dirname, '../renderer/index.html'));
}

function allowedDevRendererOrigin(): string | null {
  if (app.isPackaged) return null;
  const raw = process.env.ELECTRON_RENDERER_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function isTrustedRendererUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;

  let actual: URL;
  try {
    actual = new URL(rawUrl);
  } catch {
    return false;
  }

  const devOrigin = allowedDevRendererOrigin();
  if (devOrigin && actual.origin === devOrigin) return true;

  const expected = expectedPackagedRendererUrl();
  return actual.protocol === expected.protocol
    && actual.origin === expected.origin
    && actual.pathname === expected.pathname;
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame.url;
  if (!isTrustedRendererUrl(url)) {
    throw new Error(`Untrusted IPC sender: ${url || '<empty>'}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function expectString(
  value: unknown,
  name: string,
  opts: { allowEmpty?: boolean; maxLength?: number } = {},
): string {
  const { allowEmpty = false, maxLength = MAX_PATH_LENGTH } = opts;
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  if (!allowEmpty && value.length === 0) throw new RangeError(`${name} must not be empty`);
  if (value.length > maxLength) throw new RangeError(`${name} is too long`);
  return value;
}

function expectStringArray(
  value: unknown,
  name: string,
  opts: { maxItems?: number; maxItemLength?: number } = {},
): string[] {
  const { maxItems = MAX_PATHS_PER_REQUEST, maxItemLength = MAX_PATH_LENGTH } = opts;
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  if (value.length > maxItems) throw new RangeError(`${name} has too many items`);
  return value.map((item, index) => expectString(item, `${name}[${index}]`, { maxLength: maxItemLength }));
}

function expectBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`);
  return value;
}

function expectInteger(
  value: unknown,
  name: string,
  opts: { min: number; max: number },
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  if (value < opts.min || value > opts.max) {
    throw new RangeError(`${name} must be between ${opts.min} and ${opts.max}`);
  }
  return value;
}

function expectArgs(args: unknown[], channel: string, count: number): void {
  if (args.length !== count) {
    throw new TypeError(`${channel} expected ${count} argument(s), received ${args.length}`);
  }
}

function validateListDirOptions(value: unknown): ListDirOptions {
  if (!isRecord(value)) throw new TypeError('opts must be an object');
  return { showHidden: expectBoolean(value.showHidden, 'opts.showHidden') };
}

export function validateFileContextArgs(value: unknown): FileContextArgs {
  if (!isRecord(value)) throw new TypeError('args must be an object');
  return {
    x: expectInteger(value.x, 'args.x', { min: -MAX_MENU_COORDINATE, max: MAX_MENU_COORDINATE }),
    y: expectInteger(value.y, 'args.y', { min: -MAX_MENU_COORDINATE, max: MAX_MENU_COORDINATE }),
    fullPath: expectString(value.fullPath, 'args.fullPath'),
    isDir: expectBoolean(value.isDir, 'args.isDir'),
    isDotDot: expectBoolean(value.isDotDot, 'args.isDotDot'),
    isAppBundle: expectBoolean(value.isAppBundle, 'args.isAppBundle'),
  };
}

export function validateFileOpPayload(value: unknown): FileOp {
  if (!isRecord(value)) throw new TypeError('op must be an object');
  const kind = value.kind;
  if (kind !== 'copy' && kind !== 'move') throw new TypeError('op.kind must be copy or move');
  return {
    kind,
    sources: expectStringArray(value.sources, 'op.sources'),
    dst: expectString(value.dst, 'op.dst'),
  };
}

export function validateConflictAnswerPayload(value: unknown): ConflictAnswer {
  if (!isRecord(value)) throw new TypeError('answer must be an object');
  switch (value.action) {
    case 'overwrite':
    case 'skip':
      return {
        action: value.action,
        applyToAll: expectBoolean(value.applyToAll, 'answer.applyToAll'),
      };
    case 'rename':
      return {
        action: 'rename',
        newName: expectString(value.newName, 'answer.newName', { maxLength: MAX_BASENAME_LENGTH }),
        applyToAll: false,
      };
    case 'cancel':
      return { action: 'cancel' };
    default:
      throw new TypeError('answer.action must be overwrite, skip, rename, or cancel');
  }
}

function handleValidated<TArgs extends unknown[], TResult>(
  channel: string,
  validateArgs: (args: unknown[]) => TArgs,
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => TResult | Promise<TResult>,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return handler(event, ...validateArgs(args));
  });
}

function isTerminalOpEvent(event: OpEvent): boolean {
  return event.kind === 'complete' || event.kind === 'cancelled' || event.kind === 'error';
}

function rememberOwnerOp(ownerId: number, id: OpId): void {
  const ids = ownerOpIds.get(ownerId);
  if (ids) {
    ids.add(id);
    return;
  }
  ownerOpIds.set(ownerId, new Set([id]));
}

function forgetOwnerOp(ownerId: number, id: OpId): void {
  const ids = ownerOpIds.get(ownerId);
  if (!ids) return;
  ids.delete(id);
  if (ids.size === 0) ownerOpIds.delete(ownerId);
}

function disposeOpBridge(id: OpId): void {
  const bridge = opBridges.get(id);
  if (!bridge) return;
  if (bridge.cleanupTimer) clearTimeout(bridge.cleanupTimer);
  bridge.runnerUnsubscribe();
  opBridges.delete(id);
  forgetOwnerOp(bridge.owner.id, id);
}

function cleanupOwnerOpBridges(ownerId: number): void {
  const ids = ownerOpIds.get(ownerId);
  if (ids) {
    for (const id of [...ids]) {
      runner.cancel(id);
      disposeOpBridge(id);
    }
  }
  watchedOpOwners.delete(ownerId);
}

function ensureOpOwnership(sender: WebContents, id: OpId): OpBridge | null {
  const bridge = opBridges.get(id);
  if (!bridge) return null;
  if (bridge.owner.id !== sender.id) {
    throw new Error(`Operation ${id} belongs to a different renderer`);
  }
  return bridge;
}

function scheduleOpBridgeCleanup(id: OpId): void {
  const bridge = opBridges.get(id);
  if (!bridge) return;
  if (bridge.cleanupTimer) clearTimeout(bridge.cleanupTimer);
  bridge.cleanupTimer = setTimeout(() => disposeOpBridge(id), OP_BRIDGE_RETENTION_MS);
}

function bufferOpEvent(bridge: OpBridge, event: OpEvent): void {
  if (event.kind === 'progress') {
    const last = bridge.buffer[bridge.buffer.length - 1];
    if (last?.kind === 'progress') bridge.buffer[bridge.buffer.length - 1] = event;
    else bridge.buffer.push(event);
  } else {
    bridge.buffer.push(event);
  }

  while (bridge.buffer.length > MAX_BUFFERED_OP_EVENTS) {
    const progressIndex = bridge.buffer.findIndex((entry) => entry.kind === 'progress');
    if (progressIndex >= 0) bridge.buffer.splice(progressIndex, 1);
    else bridge.buffer.shift();
  }
}

function sendOpEvent(id: OpId, bridge: OpBridge, event: OpEvent): void {
  if (bridge.owner.isDestroyed()) {
    disposeOpBridge(id);
    return;
  }
  bridge.owner.send(`ops:event:${id}`, event);
}

function forwardOpEvent(id: OpId, event: OpEvent): void {
  const bridge = opBridges.get(id);
  if (!bridge) return;

  if (bridge.ready) sendOpEvent(id, bridge, event);
  else bufferOpEvent(bridge, event);

  if (isTerminalOpEvent(event)) scheduleOpBridgeCleanup(id);
}

export function registerIpc() {
  handleValidated('fs:listDir', (args): [string, ListDirOptions] => {
    expectArgs(args, 'fs:listDir', 2);
    return [
      expectString(args[0], 'path'),
      validateListDirOptions(args[1]),
    ];
  }, (_e, path, opts) => listDir(path, opts));
  handleValidated('fs:stat', (args): [string] => {
    expectArgs(args, 'fs:stat', 1);
    return [expectString(args[0], 'path')];
  }, (_e, path) => stat(path));
  handleValidated('fs:mkdir', (args): [string, string] => {
    expectArgs(args, 'fs:mkdir', 2);
    return [
      expectString(args[0], 'parent'),
      expectString(args[1], 'name', { maxLength: MAX_BASENAME_LENGTH }),
    ];
  }, (_e, parent, name) => mkdir(parent, name));
  handleValidated('fs:rename', (args): [string, string] => {
    expectArgs(args, 'fs:rename', 2);
    return [
      expectString(args[0], 'from'),
      expectString(args[1], 'to'),
    ];
  }, (_e, from, to) => rename(from, to));
  handleValidated('fs:trash', (args): [string[]] => {
    expectArgs(args, 'fs:trash', 1);
    return [expectStringArray(args[0], 'paths')];
  }, (_e, paths) => trashPaths(paths));
  handleValidated('fs:delete', (args): [string[]] => {
    expectArgs(args, 'fs:delete', 1);
    return [expectStringArray(args[0], 'paths')];
  }, (_e, paths) => deletePaths(paths));
  handleValidated('fs:duplicate', (args): [string] => {
    expectArgs(args, 'fs:duplicate', 1);
    return [expectString(args[0], 'path')];
  }, (_e, path) => duplicate(path));
  handleValidated('volumes:list', (args): [] => {
    expectArgs(args, 'volumes:list', 0);
    return [];
  }, () => listVolumes());
  handleValidated('shell:openPath', (args): [string] => {
    expectArgs(args, 'shell:openPath', 1);
    return [expectString(args[0], 'path')];
  }, (_e, path) => shell.openPath(path));
  handleValidated('shell:quickLook', (args): [string] => {
    expectArgs(args, 'shell:quickLook', 1);
    return [expectString(args[0], 'path')];
  }, (_e, path) => { quickLook(path); });
  handleValidated('shell:openTerminal', (args): [string] => {
    expectArgs(args, 'shell:openTerminal', 1);
    return [expectString(args[0], 'path')];
  }, (_e, path) => openTerminal(path));
  handleValidated('shell:runCommand', (args): [string, string] => {
    expectArgs(args, 'shell:runCommand', 2);
    return [
      expectString(args[0], 'cmd', { maxLength: MAX_COMMAND_LENGTH }),
      expectString(args[1], 'cwd'),
    ];
  }, (_e, cmd, cwd) => runCommand(cmd, cwd));

  handleValidated('term:spawn', (args): [string, number, number] => {
    expectArgs(args, 'term:spawn', 3);
    return [
      expectString(args[0], 'cwd'),
      expectInteger(args[1], 'cols', { min: 1, max: MAX_TERMINAL_DIMENSION }),
      expectInteger(args[2], 'rows', { min: 1, max: MAX_TERMINAL_DIMENSION }),
    ];
  }, (e, cwd, cols, rows) => {
    const id = spawnTerminal(e.sender, cwd, cols, rows);
    e.sender.once('destroyed', () => killAllForContents(e.sender));
    return id;
  });
  handleValidated('term:write', (args): [string, string] => {
    expectArgs(args, 'term:write', 2);
    return [
      expectString(args[0], 'id', { maxLength: 128 }),
      expectString(args[1], 'data', { allowEmpty: true, maxLength: MAX_TERMINAL_DATA_LENGTH }),
    ];
  }, (_e, id, data) => writeTerminal(id, data));
  handleValidated('term:resize', (args): [string, number, number] => {
    expectArgs(args, 'term:resize', 3);
    return [
      expectString(args[0], 'id', { maxLength: 128 }),
      expectInteger(args[1], 'cols', { min: 1, max: MAX_TERMINAL_DIMENSION }),
      expectInteger(args[2], 'rows', { min: 1, max: MAX_TERMINAL_DIMENSION }),
    ];
  }, (_e, id, cols, rows) => resizeTerminal(id, cols, rows));
  handleValidated('term:kill', (args): [string] => {
    expectArgs(args, 'term:kill', 1);
    return [expectString(args[0], 'id', { maxLength: 128 })];
  }, (_e, id) => killTerminal(id));

  handleValidated('menu:popupFileContext', (args): [FileContextArgs] => {
    expectArgs(args, 'menu:popupFileContext', 1);
    return [validateFileContextArgs(args[0])];
  }, (e, args) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) popupFileContext(win, args);
  });

  handleValidated('ops:start', (args): [FileOp] => {
    expectArgs(args, 'ops:start', 1);
    return [validateFileOpPayload(args[0])];
  }, (e, op) => {
    const id = runner.start(op);
    const wc = e.sender;
    if (!watchedOpOwners.has(wc.id)) {
      watchedOpOwners.add(wc.id);
      wc.once('destroyed', () => cleanupOwnerOpBridges(wc.id));
    }
    const bridge: OpBridge = {
      owner: wc,
      ready: false,
      buffer: [],
      runnerUnsubscribe: () => {},
      cleanupTimer: null,
    };
    opBridges.set(id, bridge);
    rememberOwnerOp(wc.id, id);
    bridge.runnerUnsubscribe = runner.subscribe(id, (ev) => forwardOpEvent(id, ev));
    return id;
  });
  handleValidated('ops:subscribe', (args): [OpId] => {
    expectArgs(args, 'ops:subscribe', 1);
    return [expectString(args[0], 'id', { maxLength: 128 }) as OpId];
  }, (e, id) => {
    const bridge = ensureOpOwnership(e.sender, id);
    if (!bridge) return;
    bridge.ready = true;
    const buffered = bridge.buffer.slice();
    bridge.buffer.length = 0;
    for (const event of buffered) sendOpEvent(id, bridge, event);
  });
  handleValidated('ops:unsubscribe', (args): [OpId] => {
    expectArgs(args, 'ops:unsubscribe', 1);
    return [expectString(args[0], 'id', { maxLength: 128 }) as OpId];
  }, (e, id) => {
    const bridge = ensureOpOwnership(e.sender, id);
    if (!bridge) return;
    // Once the renderer drops its only event subscription there is no safe way
    // to resolve conflicts or report failures, so stop the underlying work too.
    runner.cancel(id);
    disposeOpBridge(id);
  });
  handleValidated('ops:cancel', (args): [OpId] => {
    expectArgs(args, 'ops:cancel', 1);
    return [expectString(args[0], 'id', { maxLength: 128 }) as OpId];
  }, (e, id) => {
    if (!ensureOpOwnership(e.sender, id)) return;
    runner.cancel(id);
  });
  handleValidated('ops:answerConflict', (args): [OpId, ConflictAnswer] => {
    expectArgs(args, 'ops:answerConflict', 2);
    return [
      expectString(args[0], 'id', { maxLength: 128 }) as OpId,
      validateConflictAnswerPayload(args[1]),
    ];
  }, (e, id, a) => {
    if (!ensureOpOwnership(e.sender, id)) return;
    runner.answerConflict(id, a);
  });

  handleValidated('update:check', (args): [] => {
    expectArgs(args, 'update:check', 0);
    return [];
  }, () => checkForUpdates());
  handleValidated('update:download', (args): [] => {
    expectArgs(args, 'update:download', 0);
    return [];
  }, () => downloadUpdate());
  handleValidated('update:install', (args): [] => {
    expectArgs(args, 'update:install', 0);
    return [];
  }, () => quitAndInstall());
  handleValidated('update:status', (args): [] => {
    expectArgs(args, 'update:status', 0);
    return [];
  }, () => getUpdateStatus());
  handleValidated('update:releaseNotes', (args): [] => {
    expectArgs(args, 'update:releaseNotes', 0);
    return [];
  }, () => openReleaseNotes());
}

export { runner };
