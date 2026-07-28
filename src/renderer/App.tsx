import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AppMode, ConversationEntry, UserContext, SettingsState } from './types';
import type { LLMConfig, LLMProvider } from './services/llmService';
import { streamLLM, callLLM, PROVIDER_MODELS } from './services/llmService';
import { audioService, type TranscriptionChunk } from './services/audioService';
import { screenCaptureService } from './services/screenCaptureService';
import OverlayHeader from './components/OverlayHeader';
import InterviewMode from './components/InterviewMode';
import CodingMode from './components/CodingMode';
import SetupPanel from './components/SetupPanel';
import SettingsPanel from './components/SettingsPanel';

const DEFAULT_SETTINGS: SettingsState = {
  // Default = Ollama Cloud deepseek-v4-pro (free, key seeded from .env at startup).
  // This is the verified-working free path. NOTE: the OpenClaw *local* gateway on
  // :18789 is a WebSocket-RPC control panel, NOT an OpenAI HTTP inference endpoint;
  // gateway_ollama / featherless remain selectable but need a real OpenAI-compatible
  // gateway URL (Settings → OpenClaw Gateway Endpoint) before they will answer.
  provider: 'ollama',
  model: 'deepseek-v4-pro',
  apiKeys: {},
  ollamaEndpoint: 'https://api.ollama.com',
  customEndpoints: {},
  overlayOpacity: 0.92,
  fontSize: 14,
  theme: 'dark',
  transcriptionMode: 'whisper', // local faster-whisper (on-device, no API key)
};

const DEFAULT_CONTEXT: UserContext = {
  resumeText: '',
  jobDescription: '',
  stories: '',
  programmingLanguage: 'python',
  companyName: '',
  roleName: '',
  additionalNotes: '',
};

export default function App() {
  const [mode, setMode] = useState<AppMode>('idle');
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [userContext, setUserContext] = useState<UserContext>(DEFAULT_CONTEXT);
  const [isListening, setIsListening] = useState(false);
  const [isScreenCapturing, setIsScreenCapturing] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [suggestedAnswer, setSuggestedAnswer] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [codingProblem, setCodingProblem] = useState('');
  const [codingSolution, setCodingSolution] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [stealthMode, setStealthMode] = useState(false);

  const transcriptBuffer = useRef('');
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioSilentSeconds, setAudioSilentSeconds] = useState(0);

  // Load saved settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const api = window.electronAPI;
      if (!api) return;
      const stored = await api.getAllStore();
      if (stored) {
        const storedProvider: LLMProvider =
          (stored.llmProvider as LLMProvider) || (DEFAULT_SETTINGS.provider as LLMProvider);
        const storedModel: string = stored.llmModel || DEFAULT_SETTINGS.model;

        // Migration: if the stored model no longer exists in the catalog
        // (e.g. 'claude-opus-5' was renamed to 'claude-opus-4-5-20251101'),
        // fall back to the first model for that provider so the app keeps working.
        const validModels = PROVIDER_MODELS[storedProvider]?.models || [];
        const isValidModel = validModels.some((m) => m.id === storedModel);
        const resolvedModel = isValidModel ? storedModel : validModels[0]?.id || storedModel;

        setSettings((prev) => ({
          ...prev,
          provider: storedProvider,
          model: resolvedModel,
          apiKeys: stored.apiKeys || prev.apiKeys,
          ollamaEndpoint: stored.ollamaEndpoint || prev.ollamaEndpoint,
          customEndpoints: stored.customEndpoints || prev.customEndpoints,
          overlayOpacity: stored.overlayOpacity ?? prev.overlayOpacity,
          fontSize: stored.fontSize ?? prev.fontSize,
          theme: stored.theme || prev.theme,
          transcriptionMode: stored.transcriptionMode || prev.transcriptionMode,
        }));
        setUserContext((prev) => ({
          ...prev,
          resumeText: stored.resumeText || prev.resumeText,
          jobDescription: stored.jobDescription || prev.jobDescription,
          stories: stored.stories || prev.stories,
        }));
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  function getLLMConfig(): LLMConfig {
    return {
      provider: settings.provider,
      model: settings.model,
      apiKey: settings.apiKeys[settings.provider] || '',
      endpoint:
        settings.provider === 'gateway_ollama' || settings.provider === 'featherless'
          ? settings.customEndpoints['gateway'] || undefined // falls back to localhost:18789 in llmService
          : settings.provider === 'ollama'
          ? settings.ollamaEndpoint
          : settings.customEndpoints[settings.provider] || undefined,
      temperature: 0.3,
      maxTokens: 4096,
    };
  }

  // ── Interview Mode: Audio Transcription → AI Answer ──

  const handleTranscription = useCallback(
    (chunk: TranscriptionChunk) => {
      if (chunk.isFinal) {
        transcriptBuffer.current += ' ' + chunk.text;
        setCurrentTranscript(transcriptBuffer.current.trim());
      } else {
        setCurrentTranscript(transcriptBuffer.current + ' ' + chunk.text);
      }
      // No auto-trigger — user taps "Answer This" when the interviewer finishes a question
    },
    [settings, userContext]
  );

  // User taps "Answer This" to generate an answer from the current transcript
  function handleAnswerThis() {
    const question = transcriptBuffer.current.trim();
    if (question.length > 5) {
      stopListening();
      generateInterviewAnswer(question);
      transcriptBuffer.current = '';
      setCurrentTranscript('');
    }
  }

  // Clear the transcript buffer without generating an answer
  function handleClearTranscript() {
    transcriptBuffer.current = '';
    setCurrentTranscript('');
  }

  async function startListening() {
    setError(null);
    setAudioLevel(0);
    setAudioSilentSeconds(0);
    // Wire up real-time level + silence metering for the UI meter.
    const removeLevel = audioService.addLevelListener((lvl) => setAudioLevel(lvl));
    const removeSilence = audioService.addSilenceListener((s) => setAudioSilentSeconds(s));
    try {
      // Capture the call's output, not the candidate's microphone. This works
      // with speakers or a a wired headset because it taps system audio before output.
      console.log('[App] Starting interviewer system-audio capture');
      await audioService.startSystemAudioCapture(
        (chunk) => {
          handleTranscription(chunk);
        },
        {
          mode: settings.transcriptionMode,
          whisperApiKey: settings.apiKeys['openai'],
        }
      );

      setIsListening(true);
      setMode('interview');
    } catch (e: any) {
      setError(`Audio capture failed: ${e.message}`);
      removeLevel();
      removeSilence();
    }
  }

  function stopListening() {
    audioService.stopCapture();
    setIsListening(false);
    setAudioLevel(0);
    setAudioSilentSeconds(0);
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
  }

  async function generateInterviewAnswer(question: string) {
    setIsGenerating(true);
    setSuggestedAnswer('');
    setError(null);

    // Add the question to conversation
    const questionEntry: ConversationEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      speaker: 'interviewer',
      text: question,
      type: 'question',
    };
    setConversation((prev) => [...prev, questionEntry]);

    const systemPrompt = buildInterviewSystemPrompt();
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversation.slice(-10).map((c) => ({
        role: (c.speaker === 'interviewer' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: c.text,
      })),
      { role: 'user' as const, content: `The interviewer asked: "${question}"\n\nProvide a strong, concise answer I can use.` },
    ];

    try {
      // Auto-expand overlay when answer starts coming in
      setIsMinimized(false);
      setStealthMode(false);

      await streamLLM(
        messages,
        getLLMConfig(),
        (chunk) => setSuggestedAnswer((prev) => prev + chunk),
        (response) => {
          setIsGenerating(false);
          const answerEntry: ConversationEntry = {
            id: (Date.now() + 1).toString(),
            timestamp: Date.now(),
            speaker: 'ai',
            text: response.text,
            type: 'suggestion',
          };
          setConversation((prev) => [...prev, answerEntry]);
        }
      );
    } catch (e: any) {
      setError(`LLM Error: ${e.message}`);
      setIsGenerating(false);
    }
  }

  function buildInterviewSystemPrompt(): string {
    let prompt = `You are a discreet interview assistant. The candidate is in a live interview right now. Provide concise, natural-sounding answers they can paraphrase.

RULES:
- Keep answers concise (under 120 words unless it's a deep technical question)
- Sound natural and conversational, not robotic
- Default to a strong GENERAL interview answer first, even if the question is outside the candidate's resume
- Use the candidate's resume ONLY when the interviewer clearly asks about past experience, projects, achievements, or "tell me about a time"
- NEVER force resume details into simple technical definition questions
- NEVER fabricate personal experience
- If the transcript is unclear or partial, first suggest a short clarification like: "Sorry, could you repeat that?"
- For behavioral questions, use STAR format (Situation, Task, Action, Result)
- For technical questions, prioritize correctness, simplicity, and interview-ready explanations over personalization
- Prefer this structure:
  1. Best direct answer
  2. Optional short follow-up or example
  3. Only then a resume tie-in if truly relevant
- Format: brief bullet points, then a short sample response`;

    if (userContext.resumeText) {
      prompt += `\n\n── CANDIDATE RESUME ──\n${userContext.resumeText}`;
    }
    if (userContext.jobDescription) {
      prompt += `\n\n── JOB DESCRIPTION ──\n${userContext.jobDescription}`;
    }
    if (userContext.stories) {
      prompt += `\n\n── CANDIDATE STORIES / EXPERIENCES ──\n${userContext.stories}`;
    }
    if (userContext.companyName) {
      prompt += `\n\nCompany: ${userContext.companyName}`;
    }
    if (userContext.roleName) {
      prompt += `\nRole: ${userContext.roleName}`;
    }
    if (userContext.additionalNotes) {
      prompt += `\n\nAdditional notes: ${userContext.additionalNotes}`;
    }

    return prompt;
  }

  // ── Coding Mode: Screenshot → OCR → Solution ──

  async function captureAndAnalyzeScreen() {
    setError(null);
    setIsGenerating(true);
    setCodingProblem('Analyzing screen...');
    setCodingSolution('');

    try {
      const screenshot = await screenCaptureService.takeScreenshot();
      if (!screenshot) throw new Error('Failed to capture screenshot');

      // Step 1: Extract the coding problem from the screenshot
      const problem = await screenCaptureService.analyzeScreenForCode(screenshot, getLLMConfig(), {
        jobDescription: userContext.jobDescription,
        programmingLanguage: userContext.programmingLanguage,
      });
      setCodingProblem(problem);

      // Step 2: Solve the problem
      const solution = await screenCaptureService.solveCodingProblem(problem, getLLMConfig(), {
        programmingLanguage: userContext.programmingLanguage,
        resumeContext: userContext.resumeText,
        additionalNotes: userContext.additionalNotes,
      });
      setCodingSolution(solution);

      // Add to conversation history
      setConversation((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          timestamp: Date.now(),
          speaker: 'interviewer',
          text: problem,
          type: 'question',
        },
        {
          id: (Date.now() + 1).toString(),
          timestamp: Date.now(),
          speaker: 'ai',
          text: solution,
          type: 'code',
        },
      ]);
    } catch (e: any) {
      setError(`Screen capture error: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Manual question input ──
  async function handleManualQuestion(question: string) {
    if (!question.trim()) return;
    setCurrentTranscript(question);
    await generateInterviewAnswer(question);
  }

  // ── UI ──

  if (stealthMode) {
    return (
      <div
        className="w-full h-full flex items-center justify-center cursor-pointer group"
        onClick={() => setStealthMode(false)}
        title="Click to show overlay"
      >
        <div className="flex flex-col items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          <div className="w-3 h-3 rounded-full bg-green-500 pulse-dot" />
          <span className="text-[9px] text-green-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Click to restore
          </span>
        </div>
      </div>
    );
  }

  if (isMinimized) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div
          className="bg-gray-900/95 backdrop-blur-xl rounded-full px-4 py-2 flex items-center gap-2 cursor-pointer border border-purple-500/40 hover:border-purple-400 transition-all shadow-2xl hover:scale-105"
          onClick={() => setIsMinimized(false)}
          title="Click to expand"
        >
          {isListening && <div className="w-2.5 h-2.5 rounded-full bg-red-500 pulse-dot" />}
          {isScreenCapturing && <div className="w-2.5 h-2.5 rounded-full bg-blue-500 pulse-dot" />}
          {isGenerating && <div className="w-2.5 h-2.5 rounded-full bg-amber-500 pulse-dot" />}
          <span className="text-white text-xs font-bold">IC</span>
          <span className="text-gray-400 text-[9px]">tap to open</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-950/[0.92] backdrop-blur-xl rounded-2xl border border-gray-800/60 shadow-2xl overflow-hidden">
      <OverlayHeader
        mode={mode}
        isListening={isListening}
        isScreenCapturing={isScreenCapturing}
        isGenerating={isGenerating}
        provider={settings.provider}
        model={settings.model}
        onMinimize={() => setIsMinimized(true)}
        onStealth={() => setStealthMode(true)}
        onSettings={() => setMode(mode === 'settings' ? 'idle' : 'settings')}
      />

      <div className="flex-1 overflow-y-auto p-3 min-h-0" style={{ fontSize: settings.fontSize }}>
        {error && (
          <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs fade-in">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">✕</button>
          </div>
        )}

        {mode === 'idle' && (
          <SetupPanel
            userContext={userContext}
            onUpdateContext={setUserContext}
            onStartInterview={() => { setMode('interview'); }}
            onStartCoding={() => { setMode('coding'); }}
            settings={settings}
            onUpdateSettings={setSettings}
          />
        )}

        {mode === 'interview' && (
          <InterviewMode
            isListening={isListening}
            isGenerating={isGenerating}
            currentTranscript={currentTranscript}
            suggestedAnswer={suggestedAnswer}
            conversation={conversation}
            onStartListening={startListening}
            onStopListening={stopListening}
            onManualQuestion={handleManualQuestion}
            onRegenerateAnswer={(q) => generateInterviewAnswer(q)}
            onAnswerThis={handleAnswerThis}
            onClearTranscript={handleClearTranscript}
            fontSize={settings.fontSize}
            audioLevel={audioLevel}
            audioSilentSeconds={audioSilentSeconds}
          />
        )}

        {mode === 'coding' && (
          <CodingMode
            isGenerating={isGenerating}
            codingProblem={codingProblem}
            codingSolution={codingSolution}
            programmingLanguage={userContext.programmingLanguage}
            onCapture={captureAndAnalyzeScreen}
            onSolve={(problem) =>
              screenCaptureService
                .solveCodingProblem(problem, getLLMConfig(), {
                  programmingLanguage: userContext.programmingLanguage,
                  resumeContext: userContext.resumeText,
                })
                .then(setCodingSolution)
            }
            onSetLanguage={(lang) => setUserContext((prev) => ({ ...prev, programmingLanguage: lang }))}
            fontSize={settings.fontSize}
          />
        )}

        {mode === 'settings' && (
          <SettingsPanel
            settings={settings}
            onUpdateSettings={async (newSettings) => {
              setSettings(newSettings);
              const api = window.electronAPI;
              if (api) {
                await api.setStore('llmProvider', newSettings.provider);
                await api.setStore('llmModel', newSettings.model);
                await api.setStore('apiKeys', newSettings.apiKeys);
                await api.setStore('ollamaEndpoint', newSettings.ollamaEndpoint);
                await api.setStore('customEndpoints', newSettings.customEndpoints);
                await api.setStore('overlayOpacity', newSettings.overlayOpacity);
                await api.setStore('fontSize', newSettings.fontSize);
                await api.setStore('transcriptionMode', newSettings.transcriptionMode);
              }
            }}
            userContext={userContext}
            onUpdateContext={async (ctx) => {
              setUserContext(ctx);
              const api = window.electronAPI;
              if (api) {
                await api.setStore('resumeText', ctx.resumeText);
                await api.setStore('jobDescription', ctx.jobDescription);
                await api.setStore('stories', ctx.stories);
              }
            }}
          />
        )}
      </div>

      {/* Bottom bar — mode switcher */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-800/60 bg-gray-900/40">
        <div className="flex gap-1">
          {(['idle', 'interview', 'coding'] as AppMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                mode === m
                  ? 'bg-blue-600/80 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
            >
              {m === 'idle' ? '⚙ Setup' : m === 'interview' ? '🎤 Interview' : '💻 Coding'}
            </button>
          ))}
        </div>
        <div className="text-[9px] text-gray-600">
          Ctrl+Shift+I toggle · Ctrl+Shift+H dim
        </div>
      </div>
    </div>
  );
}
