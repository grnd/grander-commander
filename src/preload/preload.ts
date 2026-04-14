import { contextBridge, ipcRenderer } from 'electron';
import type { GCApi } from './api';

const api: GCApi = {
  fs: {
    listDir: (path, opts) => ipcRenderer.invoke('fs:listDir', path, opts),
    stat: (path) => ipcRenderer.invoke('fs:stat', path),
  },
  volumes: {
    list: () => ipcRenderer.invoke('volumes:list'),
  },
  shell: {
    openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
  },
};

contextBridge.exposeInMainWorld('gc', api);
