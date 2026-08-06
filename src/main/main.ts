import { app, BrowserWindow, ipcMain, desktopCapturer, screen, globalShortcut, dialog, systemPreferences, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

// ── Local Whisper server (faster-whisper) ──
// Transcription runs fully on-device. We spawn the Python server once on
// launch and keep the model warm; the renderer POSTs audio chunks to it at
// http://localhost:18799/v1/audio/transcriptions (OpenAI-compatible shape).
let whisperProc: ChildProcess | null = null;

async function isWhisperReady(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:18799/');
    return res.ok;
  } catch {
    return false;
  }
}

function waitForWhisperReady(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = async () => {
      if (await isWhisperReady()) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 1000);
    };
    // Give the server a 2s head start before first poll.
    setTimeout(check, 2000);
  });
}

function findWhisperScript(): string | null {
  // Search candidate locations — covers dev, prod (packaged), and direct electron runs.
  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'whisper_server.py'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', 'whisper_server.py'),
    path.join(app.getAppPath(), 'whisper_server.py'),       // project root (dev) or dist/main (prod w/ copy step)
    path.join(__dirname, 'whisper_server.py'),               // dist/main (same dir as compiled main.js)
    path.join(__dirname, '..', 'whisper_server.py'),         // one level up from dist/main
    path.join(app.getAppPath(), '..', 'whisper_server.py'),  // parent of app path (packaged app)
    path.join(process.cwd(), 'whisper_server.py'),           // cwd fallback
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Kill any process holding the whisper port. We do this BEFORE checking
 * `isWhisperReady()` so that stale servers (left running after a ^C, a
 * crash, or a previous version of the app) get replaced with a fresh
 * one that picks up the current env config (e.g. WHISPER_VAD).
 */
async function freeWhisperPort(): Promise<void> {
  const port = 18799;
  try {
    const { execSync } = require('child_process');
    const out = execSync(`lsof -ti tcp:${port} 2>/dev/null || true`).toString().trim();
    if (!out) return;
    const pids = out.split('\n').filter(Boolean);
    for (const pid of pids) {
      const n = parseInt(pid, 10);
      if (Number.isFinite(n) && n !== process.pid) {
        console.log(`[Main] Killing stale Whisper process on :${port} (pid ${n})`);
        try { process.kill(n, 'SIGTERM'); } catch (_) { /* ignore */ }
      }
    }
    // Give the OS a moment to release the port
    await new Promise((r) => setTimeout(r, 800));
  } catch (e) {
    // lsof missing or no permission — fall back to the existing reuse-or-bind flow
  }
}

async function startWhisperServer() {
  try {
    // Always start from a clean port so we never inherit a stale WHISPER_VAD=off
    // (or any other) config from a previous run.
    await freeWhisperPort();

    if (await isWhisperReady()) {
      console.log('[Main] Reusing Whisper server already listening on 127.0.0.1:18799');
      return;
    }

    const scriptPath = findWhisperScript();
    if (!scriptPath) {
      console.warn('[Main] whisper_server.py not found in any candidate location — local transcription disabled');
      console.warn('[Main] Searched:', [
        path.join(process.resourcesPath, 'app.asar.unpacked', 'whisper_server.py'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', 'whisper_server.py'),
        path.join(app.getAppPath(), 'whisper_server.py'),
        path.join(__dirname, 'whisper_server.py'),
        path.join(__dirname, '..', 'whisper_server.py'),
        path.join(app.getAppPath(), '..', 'whisper_server.py'),
        path.join(process.cwd(), 'whisper_server.py'),
      ]);
      return;
    }
    const python = process.env.PYTHON || 'python3';
    console.log('[Main] Starting local Whisper server:', python, scriptPath);
    whisperProc = spawn(python, [scriptPath], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    whisperProc.stdout?.on('data', (d) => {
      const s = d.toString().trim();
      if (s) console.log('[Whisper]', s);
    });
    whisperProc.stderr?.on('data', (d) => {
      const s = d.toString().trim();
      if (s) console.log('[Whisper]', s);
    });
    whisperProc.on('exit', (code) => {
      console.log('[Main] Whisper server exited, code', code);
      whisperProc = null;
    });

    // Wait for the server to be ready before returning.
    // The model takes 10-30s to load; we poll the health endpoint.
    const ready = await waitForWhisperReady(60000); // 60s max
    if (ready) {
      console.log('[Main] Whisper server is ready');
    } else {
      console.warn('[Main] Whisper server did not become ready within 60s — transcription may fail initially');
    }
  } catch (e) {
    console.error('[Main] Failed to start Whisper server:', e);
  }
}

function stopWhisperServer() {
  if (whisperProc) {
    try { whisperProc.kill(); } catch (_) { /* ignore */ }
    whisperProc = null;
  }
}

let overlayWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

// Store for persisting settings
const Store = require('electron-store');
const store = new Store({
  defaults: {
    llmProvider: 'anthropic',
    llmModel: 'claude-opus-5',
    apiKeys: {},
    ollamaEndpoint: 'https://api.ollama.com',
    customEndpoints: {},
    resumeText: '',
    jobDescription: '',
    stories: '',
    prepDocs: [],
    overlayOpacity: 0.92,
    overlayPosition: { x: 50, y: 50 },
    overlaySize: { width: 460, height: 700 },
    fontSize: 14,
    theme: 'dark',
  },
});

// ── Load API keys from .env file ──
// Seeds electron-store with keys from .env so the renderer can access them.
function loadEnvKeys() {
  const envPath = path.join(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return;

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const envVars: Record<string, string> = {};

  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }

  // Map env vars → electron-store apiKeys
  const currentKeys: Record<string, string> = store.get('apiKeys') || {};
  const keyMap: Record<string, string> = {
    ANTHROPIC_API_KEY: 'anthropic',
    MINIMAX_API_KEY: 'minimax',
    OPENAI_API_KEY: 'openai',
    GEMINI_API_KEY: 'gemini',
    GLM_API_KEY: 'glm',
    OLLAMA_API_KEY: 'ollama',
    OPENCLAW_API_KEY: 'openclaw',
    OPENROUTER_API_KEY: 'openrouter',
  };

  let updated = false;
  for (const [envKey, storeKey] of Object.entries(keyMap)) {
    const val = envVars[envKey];
    // Always prefer .env value over missing/empty store value
    if (val && !val.startsWith('your-')) {
      if (currentKeys[storeKey] !== val) {
        currentKeys[storeKey] = val;
        updated = true;
      }
    }
  }

  if (updated) {
    store.set('apiKeys', currentKeys);
    console.log('[Main] Loaded API keys from .env into store');
  }

  // Also load endpoints from .env
  if (envVars['OLLAMA_ENDPOINT'] && !store.get('ollamaEndpoint_userSet')) {
    store.set('ollamaEndpoint', envVars['OLLAMA_ENDPOINT']);
  }

  const currentEndpoints: Record<string, string> = store.get('customEndpoints') || {};
  if (envVars['OPENCLAW_ENDPOINT'] && !currentEndpoints['openclaw']) {
    currentEndpoints['openclaw'] = envVars['OPENCLAW_ENDPOINT'];
    store.set('customEndpoints', currentEndpoints);
  }
  if (envVars['MINIMAX_ENDPOINT'] && !currentEndpoints['minimax']) {
    currentEndpoints['minimax'] = envVars['MINIMAX_ENDPOINT'];
    store.set('customEndpoints', currentEndpoints);
  }
}

loadEnvKeys();

function createOverlayWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const savedPos = store.get('overlayPosition');
  const savedSize = store.get('overlaySize');

  overlayWindow = new BrowserWindow({
    width: savedSize.width,
    height: savedSize.height,
    x: savedPos.x,
    y: savedPos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Set always on top at floating level (above video call apps)
  overlayWindow.setAlwaysOnTop(true, 'floating', 1);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Make clicks pass through when not hovering over content
  overlayWindow.setIgnoreMouseEvents(false);

  if (process.env.NODE_ENV === 'development') {
    overlayWindow.loadURL('http://localhost:5173/');
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  overlayWindow.on('moved', () => {
    if (overlayWindow) {
      const [x, y] = overlayWindow.getPosition();
      store.set('overlayPosition', { x, y });
    }
  });

  overlayWindow.on('resized', () => {
    if (overlayWindow) {
      const [width, height] = overlayWindow.getSize();
      store.set('overlaySize', { width, height });
    }
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 800,
    height: 700,
    title: 'Interview Copilot - Settings',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    settingsWindow.loadURL('http://localhost:5173/#/settings');
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: '/settings' });
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ── IPC Handlers ──

// Settings store
ipcMain.handle('store:get', (_event, key: string) => store.get(key));
ipcMain.handle('store:set', (_event, key: string, value: any) => store.set(key, value));
ipcMain.handle('store:getAll', () => store.store);

// ── CORS-free fetch proxy ──
// All LLM API calls go through here to bypass browser CORS restrictions
ipcMain.handle('fetch:proxy', async (_event, url: string, options: {
  method: string;
  headers: Record<string, string>;
  body?: string;
}) => {
  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    });

    const contentType = response.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('text/event-stream') || options.headers?.['Accept'] === 'text/event-stream') {
      // For streaming responses, read the full text and return it
      const text = await response.text();
      return { ok: response.ok, status: response.status, data: text, streaming: true };
    } else {
      data = await response.json();
    }

    return { ok: response.ok, status: response.status, data };
  } catch (error: any) {
    return { ok: false, status: 0, data: { error: { message: error.message } } };
  }
});

// ── Whisper audio transcription proxy ──
// Handles binary audio data for local faster-whisper server or remote OpenAI Whisper API
ipcMain.handle('whisper:transcribe', async (_event, audioBuffer: ArrayBuffer, apiKey: string, endpoint: string) => {
  console.log(`[Main] Whisper: Received ${(audioBuffer.byteLength / 1024).toFixed(1)}KB audio, sending to ${endpoint}`);

  try {
    const isLocal = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
    const boundary = '----WhisperBoundary' + Date.now();
    const audioBytes = Buffer.from(audioBuffer);

    // Build multipart/form-data body.
    // Local faster-whisper only needs the file field; remote OpenAI needs model + language fields too.
    const parts: Buffer[] = [];

    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`));
    parts.push(audioBytes);

    if (!isLocal) {
      // Remote OpenAI Whisper needs model + language fields
      parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1`));
      parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen`));
      parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson`));
    }

    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const headers: Record<string, string> = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    };

    // Only send Authorization header for remote endpoints that need it.
    // Local faster-whisper server doesn't check auth and an unexpected header
    // can cause issues with some Python HTTP servers.
    if (!isLocal && apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
    });

    const data = await response.json();
    console.log('[Main] Whisper response:', response.status, JSON.stringify(data).slice(0, 200));
    return { ok: response.ok, data };
  } catch (error: any) {
    console.error('[Main] Whisper transcription error:', error.message);
    return { ok: false, data: { error: { message: error.message } } };
  }
});

// ── Streaming fetch proxy ──
// For Server-Sent Events (SSE) streaming from LLM APIs
ipcMain.handle('fetch:stream', async (event, url: string, options: {
  method: string;
  headers: Record<string, string>;
  body?: string;
}) => {
  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
      return { ok: false, status: response.status, data: errorData };
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          // Send chunk back to renderer via the webContents
          event.sender.send('fetch:stream-chunk', chunk);
        }
      }
    }

    event.sender.send('fetch:stream-done');
    return { ok: true, status: response.status };
  } catch (error: any) {
    return { ok: false, status: 0, data: { error: { message: error.message } } };
  }
});

// Window controls
ipcMain.handle('window:toggleOverlay', () => {
  if (overlayWindow) {
    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
    } else {
      overlayWindow.show();
    }
  }
});

ipcMain.handle('window:setClickThrough', (_event, enable: boolean) => {
  if (overlayWindow) {
    overlayWindow.setIgnoreMouseEvents(enable, { forward: true });
  }
});

ipcMain.handle('window:openSettings', () => {
  createSettingsWindow();
});

ipcMain.handle('window:setOpacity', (_event, opacity: number) => {
  if (overlayWindow) {
    overlayWindow.setOpacity(opacity);
  }
});

// Screen capture for coding interview OCR
ipcMain.handle('capture:screenshot', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  });

  if (sources.length > 0) {
    const screenshot = sources[0].thumbnail.toPNG();
    return screenshot.toString('base64');
  }
  return null;
});

// List open windows for the candidate to pick from (P0 fix 1.4).
// Seun's test: "the app could not read the code on screen" because the
// capture defaulted to the full screen, which on most interview setups
// includes the video call, the prep doc, etc. — VS Code is somewhere in
// the background. Letting the candidate pick a specific window is the
// cheap fix that unlocks the coding round.
ipcMain.handle('capture:listWindows', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 320, height: 200 },
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    // thumbnail is a NativeImage — toDataURL returns data:image/png;base64,...
    thumbnail: s.thumbnail.toDataURL(),
  }));
});

// Capture a specific window by its desktopCapturer source id.
ipcMain.handle('capture:window', async (_event, sourceId: string) => {
  if (!sourceId) return null;
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  const target = sources.find((s) => s.id === sourceId);
  if (!target) return null;
  return target.thumbnail.toPNG().toString('base64');
});

// System audio capture - get available audio sources
ipcMain.handle('capture:getAudioSources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
  }));
});

// Extracts plain text from a resume/job/prep-doc file on disk.
function extractFileContent(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  let content = '';

  try {
    if (ext === '.txt' || ext === '.md') {
      // Plain text files — read as UTF-8
      content = fs.readFileSync(filePath, 'utf-8');
    } else if (ext === '.docx') {
      // DOCX: extract text from XML inside the zip
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      const docXml = zip.readAsText('word/document.xml');
      // Strip XML tags to get plain text
      content = docXml
        .replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x2019;/g, "'")
        .replace(/&#x201[CD];/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    } else if (ext === '.pdf') {
      // PDF: read as binary and let the renderer handle it
      // For now, return a note that PDF requires text extraction
      content = `[PDF file: ${path.basename(filePath)}]\nNote: Please copy-paste the text content from your PDF, or use a .txt/.md/.docx file for best results.`;
    } else {
      // Attempt UTF-8 read for unknown formats
      content = fs.readFileSync(filePath, 'utf-8');
    }
  } catch (err: any) {
    // Fallback: try reading as UTF-8
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      content = `[Error reading file: ${err.message}]`;
    }
  }

  return content;
}

// File dialogs for uploading resume/job docs
ipcMain.handle('dialog:openFile', async (_event, options: { title: string; filters: any[] }) => {
  const result = await dialog.showOpenDialog({
    title: options.title,
    filters: options.filters || [
      { name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md'] },
    ],
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    return { path: filePath, content: extractFileContent(filePath), name: path.basename(filePath) };
  }
  return null;
});

// Multi-file dialog for uploading interview prep docs (company research, past
// Q&A, cheat sheets, etc). Same extraction logic as the single-file dialog,
// just returns one entry per selected file.
ipcMain.handle('dialog:openFiles', async (_event, options: { title: string; filters?: any[] }) => {
  const result = await dialog.showOpenDialog({
    title: options.title,
    filters: options.filters || [
      { name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });

  if (result.canceled || result.filePaths.length === 0) return [];

  return result.filePaths.map((filePath) => ({
    path: filePath,
    content: extractFileContent(filePath),
    name: path.basename(filePath),
  }));
});

// ── App lifecycle ──

app.whenReady().then(() => {
  // ── Media permissions: auto-approve microphone & screen capture ──
  // This prevents the "bad IPC message" crash when requesting audio
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'display-capture', 'screen'];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'display-capture', 'screen'];
    return allowed.includes(permission);
  });

  // getDisplayMedia in the renderer asks for desktop video + audio. Electron
  // supplies the primary display and an OS-level loopback track. On macOS this
  // requires Electron 39+ and NSAudioCaptureUsageDescription in Info.plist.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    }).then((sources) => {
      const primaryDisplayId = String(screen.getPrimaryDisplay().id);
      const source =
        sources.find((candidate) => candidate.display_id === primaryDisplayId) ||
        sources[0];

      if (!source) {
        console.error('[Main] System audio capture failed: no display source available');
        callback({});
        return;
      }

      console.log('[Main] Granting display capture with system-audio loopback:', source.name);
      callback({ video: source, audio: 'loopback' });
    }).catch((error) => {
      console.error('[Main] Failed to resolve display source for system audio:', error);
      callback({});
    });
  }, { useSystemPicker: false });

  // Start the local Whisper transcription server (warm model, no API key).
  startWhisperServer();

  createOverlayWindow();

  // Forward renderer console logs to the terminal for debugging
  if (overlayWindow) {
    overlayWindow.webContents.on('console-message', (_event, level, message) => {
      const prefix = ['[V]', '[V]', '[V:WARN]', '[V:ERR]'][level] || '[V]';
      console.log(`${prefix} ${message}`);
    });
  }

  // Global shortcuts
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (overlayWindow) {
      if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.show();
      }
    }
  });

  globalShortcut.register('CommandOrControl+Shift+S', () => {
    createSettingsWindow();
  });

  // Stealth mode - minimize overlay opacity
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (overlayWindow) {
      const currentOpacity = overlayWindow.getOpacity();
      overlayWindow.setOpacity(currentOpacity < 0.5 ? store.get('overlayOpacity') : 0.15);
    }
  });

  app.on('activate', () => {
    if (!overlayWindow) createOverlayWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopWhisperServer();
});
