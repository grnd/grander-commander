import { contextBridge, ipcRenderer } from 'electron';
import type { GCApi } from './api';

const api: GCApi = {
  fs: {
    listDir: (path, opts) => ipcRenderer.invoke('fs:listDir', path, opts),
    stat: (path) => ipcRenderer.invoke('fs:stat', path),
    mkdir: (parent, name) => ipcRenderer.invoke('fs:mkdir', parent, name),
    rename: (from, to) => ipcRenderer.invoke('fs:rename', from, to),
    trash: (paths) => ipcRenderer.invoke('fs:trash', paths),
    delete: (paths) => ipcRenderer.invoke('fs:delete', paths),
    duplicate: (path) => ipcRenderer.invoke('fs:duplicate', path),
  },
  volumes: {
    list: () => ipcRenderer.invoke('volumes:list'),
  },
  ops: {
    start: (op) => ipcRenderer.invoke('ops:start', op),
    cancel: (id) => ipcRenderer.invoke('ops:cancel', id),
    answerConflict: (id, a) => ipcRenderer.invoke('ops:answerConflict', id, a),
    subscribe: (id, cb) => {
      const chan = `ops:event:${id}`;
      const listener = (_: unknown, ev: unknown) => cb(ev as import('@shared/types').OpEvent);
      ipcRenderer.on(chan, listener);
      return () => ipcRenderer.removeListener(chan, listener);
    },
  },
  shell: {
    openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
    quickLook: (path) => ipcRenderer.invoke('shell:quickLook', path),
    openTerminal: (path) => ipcRenderer.invoke('shell:openTerminal', path),
    runCommand: (cmd, cwd) => ipcRenderer.invoke('shell:runCommand', cmd, cwd),
  },
  terminal: {
    spawn: (cwd, cols, rows) => ipcRenderer.invoke('term:spawn', cwd, cols, rows),
    write: (id, data) => ipcRenderer.invoke('term:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke('term:resize', id, cols, rows),
    kill: (id) => ipcRenderer.invoke('term:kill', id),
    onData: (id, cb) => {
      const chan = `term:data:${id}`;
      const listener = (_: unknown, data: unknown) => cb(String(data));
      ipcRenderer.on(chan, listener);
      return () => ipcRenderer.removeListener(chan, listener);
    },
    onExit: (id, cb) => {
      const chan = `term:exit:${id}`;
      const listener = (_: unknown, info: unknown) => cb(info as { exitCode: number; signal?: number });
      ipcRenderer.on(chan, listener);
      return () => ipcRenderer.removeListener(chan, listener);
    },
  },
  menu: {
    onCommand: (cb) => {
      const listener = (_: unknown, cmd: unknown) => cb(String(cmd));
      ipcRenderer.on('menu:command', listener);
      return () => ipcRenderer.removeListener('menu:command', listener);
    },
    popupFileContext: (args) => ipcRenderer.invoke('menu:popupFileContext', args),
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    status: () => ipcRenderer.invoke('update:status'),
    onStatus: (cb) => {
      const listener = (_: unknown, s: unknown) => cb(s as never);
      ipcRenderer.on('update:status', listener);
      return () => ipcRenderer.removeListener('update:status', listener);
    },
  },
};

contextBridge.exposeInMainWorld('gc', api);
