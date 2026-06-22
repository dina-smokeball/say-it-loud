// The safe bridge between the window and the main process.

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  listClips: () => ipcRenderer.invoke('clips:list'),
  onClipsUpdate: (cb: (clips: unknown[]) => void) =>
    ipcRenderer.on('clips:update', (_event, clips) => cb(clips)),
  onPlayFile: (cb: (name: string) => void) =>
    ipcRenderer.on('play:file', (_event, name) => cb(name)),
  ready: () => ipcRenderer.send('renderer:ready'),
});
