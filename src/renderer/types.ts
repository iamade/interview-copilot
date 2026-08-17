import type { LLMProvider } from './services/llmService';

export type AppMode = 'idle' | 'interview' | 'coding' | 'settings';
export type InterviewPhase = 'setup' | 'listening' | 'answering';

export interface AppState {
  mode: AppMode;
  interviewPhase: InterviewPhase;
  isListening: boolean;
  isScreenCapturing: boolean;
  currentTranscript: string;
  conversationHistory: ConversationEntry[];
  suggestedAnswer: string;
  isGenerating: boolean;
  codingProblem: string;
  codingSolution: string;
  error: string | null;
}

export interface ConversationEntry {
  id: string;
  timestamp: number;
  speaker: 'interviewer' | 'user' | 'ai';
  text: string;
  type: 'question' | 'answer' | 'suggestion' | 'code';
}

export interface PrepDoc {
  name: string;
  content: string;
}

export interface UserContext {
  resumeText: string;
  jobDescription: string;
  stories: string;
  programmingLanguage: string;
  companyName: string;
  roleName: string;
  additionalNotes: string;
  prepDocs: PrepDoc[];
}

export interface SettingsState {
  provider: LLMProvider;
  model: string;
  // 2026-08-17 — engine = top-level auth method. 'oauth' = keys are
  // managed by OpenClaw gateway (OLLAMA_API_KEY, OPENROUTER_API_KEY,
  // FEATHERLESSAI_OPENCLAW_KEYS, etc.); 'direct' = keys are the
  // provider's own (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
  // QWEN_API_KEY, etc.). The provider dropdown is filtered by engine
  // so the user only sees the providers reachable with that auth.
  engine: 'oauth' | 'direct';
  // Optional separate vision model for screen-capture (Coding mode).
  // If set, the analyzeScreenForCode step uses this model instead of
  // the primary; the solveCodingProblem step still uses the primary.
  // Vision models are cheap and fast at reading images, then a
  // reasoning model writes the actual solution.
  visionProvider?: LLMProvider;
  visionModel?: string;
  apiKeys: Record<string, string>;
  ollamaEndpoint: string;
  ollamaLocalEndpoint: string;
  customEndpoints: Record<string, string>;
  overlayOpacity: number;
  fontSize: number;
  theme: 'dark' | 'light';
  transcriptionMode: 'browser' | 'whisper';
}

// Electron API type declarations
declare global {
  interface Window {
    electronAPI: {
      getStore: (key: string) => Promise<any>;
      setStore: (key: string, value: any) => Promise<void>;
      getAllStore: () => Promise<any>;
      toggleOverlay: () => Promise<void>;
      setClickThrough: (enable: boolean) => Promise<void>;
      openSettings: () => Promise<void>;
      setOpacity: (opacity: number) => Promise<void>;
      takeScreenshot: () => Promise<string | null>;
      getAudioSources: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>;
      openFile: (options: { title: string; filters?: any[] }) => Promise<{ path: string; content: string; name: string } | null>;
      openFiles: (options: { title: string; filters?: any[] }) => Promise<{ path: string; content: string; name: string }[]>;

      // Whisper audio transcription via main process
      whisperTranscribe: (audioBuffer: ArrayBuffer, apiKey: string, endpoint: string) =>
        Promise<{ ok: boolean; data: any }>;

      // CORS-free fetch proxy — all API calls go through main process
      fetchProxy: (url: string, options: { method: string; headers: Record<string, string>; body?: string }) =>
        Promise<{ ok: boolean; status: number; data: any; streaming?: boolean }>;

      // Streaming fetch proxy for SSE
      fetchStream: (url: string, options: { method: string; headers: Record<string, string>; body?: string }) =>
        Promise<{ ok: boolean; status: number; data?: any }>;

      // Stream event listeners (return cleanup functions)
      onStreamChunk: (callback: (chunk: string) => void) => () => void;
      onStreamDone: (callback: () => void) => () => void;
    };
  }
}
