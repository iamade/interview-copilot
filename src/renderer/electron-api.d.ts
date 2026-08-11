// ── electronAPI type declaration (AFD-166) ──
// The contextBridge in src/main/preload.ts exposes `window.electronAPI`
// to the renderer. This file declares the shape so the renderer can
// use it with full type-safety. Keep in sync with preload.ts.
//
// Anything in preload.ts MUST be reflected here — otherwise the renderer
// falls back to `any` and silently breaks if a method is renamed.

export interface QaAddPayload {
  session_id: string;
  role: 'interviewer' | 'me' | 'system' | 'tool';
  text: string;
  meta?: Record<string, any> | null;
}

export interface QaEntry {
  id: number;
  session_id: string;
  ts: number;
  role: 'interviewer' | 'me' | 'system' | 'tool';
  text: string;
  meta: string | null;
}

export interface SessionSummary {
  session_id: string;
  first_ts: number;
  last_ts: number;
  count: number;
}

export interface ElectronAPI {
  // Store
  getStore: (key: string) => Promise<any>;
  setStore: (key: string, value: any) => Promise<void>;
  getAllStore: () => Promise<any>;

  // Window controls
  toggleOverlay: () => Promise<void>;
  setClickThrough: (enable: boolean) => Promise<void>;
  openSettings: () => Promise<void>;
  setOpacity: (opacity: number) => Promise<void>;

  // Capture
  takeScreenshot: () => Promise<any>;
  getAudioSources: () => Promise<any[]>;
  listWindows: () => Promise<any[]>;
  captureWindow: (sourceId: string) => Promise<any>;

  // File dialog
  openFile: (options: { title: string; filters?: any[] }) => Promise<any>;
  openFiles: (options: { title: string; filters?: any[] }) => Promise<any[]>;

  // Whisper
  whisperTranscribe: (audioBuffer: ArrayBuffer, apiKey: string, endpoint: string) => Promise<any>;

  // CORS-free fetch
  fetchProxy: (url: string, options: { method: string; headers: Record<string, string>; body?: string }) => Promise<any>;
  fetchStream: (url: string, options: { method: string; headers: Record<string, string>; body?: string }) => Promise<any>;
  onStreamChunk: (callback: (chunk: string) => void) => () => void;
  onStreamDone: (callback: () => void) => () => void;

  // ── AFD-166: Q&A persistence (SQLite via better-sqlite3 in main) ──
  ensureSession: () => Promise<string>;
  newSession: () => Promise<string>;
  getCurrentSession: () => Promise<string | null>;
  setCurrentSession: (sessionId: string) => Promise<string>;
  addQa: (payload: QaAddPayload) => Promise<{ id: number }>;
  listQaBySession: (sessionId: string) => Promise<QaEntry[]>;
  listAllQa: (limit?: number) => Promise<QaEntry[]>;
  listSessions: (limit?: number) => Promise<SessionSummary[]>;
  deleteQa: (id: number) => Promise<{ ok: boolean }>;
  clearSession: (sessionId: string) => Promise<{ deleted: number }>;
  countQaBySession: (sessionId: string) => Promise<{ count: number }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Re-export empty so `verbatimModuleSyntax` / `isolatedModules` is happy.
export {};
