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

export interface UserContext {
  resumeText: string;
  jobDescription: string;
  stories: string;
  programmingLanguage: string;
  companyName: string;
  roleName: string;
  additionalNotes: string;
}

export interface SettingsState {
  provider: LLMProvider;
  model: string;
  apiKeys: Record<string, string>;
  ollamaEndpoint: string;
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
