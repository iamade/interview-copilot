import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Store
  getStore: (key: string) => ipcRenderer.invoke('store:get', key),
  setStore: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
  getAllStore: () => ipcRenderer.invoke('store:getAll'),

  // Window controls
  toggleOverlay: () => ipcRenderer.invoke('window:toggleOverlay'),
  setClickThrough: (enable: boolean) => ipcRenderer.invoke('window:setClickThrough', enable),
  openSettings: () => ipcRenderer.invoke('window:openSettings'),
  setOpacity: (opacity: number) => ipcRenderer.invoke('window:setOpacity', opacity),

  // Capture
  takeScreenshot: () => ipcRenderer.invoke('capture:screenshot'),
  getAudioSources: () => ipcRenderer.invoke('capture:getAudioSources'),
  // P0 fix 1.4 — let the candidate pick a specific window to capture
  // (VS Code, LeetCode, etc.) instead of always grabbing the whole screen.
  listWindows: () => ipcRenderer.invoke('capture:listWindows'),
  captureWindow: (sourceId: string) => ipcRenderer.invoke('capture:window', sourceId),

  // File dialog
  openFile: (options: { title: string; filters?: any[] }) => ipcRenderer.invoke('dialog:openFile', options),

  // Multi-file dialog — used for interview prep doc uploads
  openFiles: (options: { title: string; filters?: any[] }) => ipcRenderer.invoke('dialog:openFiles', options),

  // Whisper audio transcription — sends binary audio to main process
  whisperTranscribe: (audioBuffer: ArrayBuffer, apiKey: string, endpoint: string) =>
    ipcRenderer.invoke('whisper:transcribe', audioBuffer, apiKey, endpoint),

  // CORS-free fetch proxy — all API calls go through main process
  fetchProxy: (url: string, options: { method: string; headers: Record<string, string>; body?: string }) =>
    ipcRenderer.invoke('fetch:proxy', url, options),

  // Streaming fetch proxy
  fetchStream: (url: string, options: { method: string; headers: Record<string, string>; body?: string }) =>
    ipcRenderer.invoke('fetch:stream', url, options),

  // Listen for stream chunks
  onStreamChunk: (callback: (chunk: string) => void) => {
    const handler = (_event: any, chunk: string) => callback(chunk);
    ipcRenderer.on('fetch:stream-chunk', handler);
    return () => ipcRenderer.removeListener('fetch:stream-chunk', handler);
  },

  onStreamDone: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('fetch:stream-done', handler);
    return () => ipcRenderer.removeListener('fetch:stream-done', handler);
  },
});
