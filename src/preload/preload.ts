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
  },
  menu: {
    onCommand: (cb) => {
      const listener = (_: unknown, cmd: unknown) => cb(String(cmd));
      ipcRenderer.on('menu:command', listener);
      return () => ipcRenderer.removeListener('menu:command', listener);
    },
  },
};

contextBridge.exposeInMainWorld('gc', api);
