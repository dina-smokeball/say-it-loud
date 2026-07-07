// The safe bridge between the window and the main process.

import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('api', {
  listClips: () => ipcRenderer.invoke('clips:list'),
  addClip: (filePath: string) => ipcRenderer.invoke('clip:add', filePath),
  // File.path was removed in Electron 32; this is the supported way to get a dropped file's real path.
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  onClipsUpdate: (cb: (clips: unknown[]) => void) =>
    ipcRenderer.on('clips:update', (_event, clips) => cb(clips)),
  onPlayFile: (cb: (name: string) => void) =>
    ipcRenderer.on('play:file', (_event, name) => cb(name)),
  ready: () => ipcRenderer.send('renderer:ready'),
});
