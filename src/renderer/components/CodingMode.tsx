import React, { useState, useRef, useEffect } from 'react';
import { screenCaptureService, type WindowSource } from '../services/screenCaptureService';
import { audioService, type TranscriptionChunk } from '../services/audioService';

interface Props {
  isGenerating: boolean;
  codingProblem: string;
  codingSolution: string;
  programmingLanguage: string;
  // 2026-08-17 P0 fix — Coding mode now combines SCREEN + AUDIO. The
  // parent (App.tsx) owns the audio state (transcript buffer, listening
  // flag) so it can stay shared with Interview mode if the user switches
  // mid-session. The Coding mode only renders the toggle + preview.
  isListening: boolean;
  audioTranscript: string;
  audioLevel: number;
  audioSilentSeconds: number;
  permissionStatus: 'granted' | 'denied' | 'restricted' | 'unknown' | 'not-determined' | 'unchecked';
  permissionMessage: string;
  onStartAudio: () => void;
  onStopAudio: () => void;
  onCheckPermission: () => void;
  onCapture: () => void;
  onSolve: (problem: string, audioTranscript?: string) => Promise<void>;
  onSetLanguage: (lang: string) => void;
  fontSize: number;
}

const LANGUAGES = [
  'python', 'javascript', 'typescript', 'java', 'c++', 'c#', 'go', 'rust', 'ruby', 'swift', 'kotlin', 'sql',
];

export default function CodingMode({
  isGenerating,
  codingProblem,
  codingSolution,
  programmingLanguage,
  isListening,
  audioTranscript,
  audioLevel,
  audioSilentSeconds,
  permissionStatus,
  permissionMessage,
  onStartAudio,
  onStopAudio,
  onCheckPermission,
  onCapture,
  onSolve,
  onSetLanguage,
  fontSize,
}: Props) {
  const [manualProblem, setManualProblem] = useState('');
  const [showProblem, setShowProblem] = useState(true);
  const [showWindowPicker, setShowWindowPicker] = useState(false);
  const [windowList, setWindowList] = useState<WindowSource[]>([]);
  const [pickedWindowName, setPickedWindowName] = useState<string | null>(null);
  const solutionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (solutionRef.current) {
      solutionRef.current.scrollTop = solutionRef.current.scrollHeight;
    }
  }, [codingSolution]);

  // 2026-08-17 P0 fix — pre-flight the macOS Screen Recording permission
  // the first time the user enters Coding mode so we can show a banner
  // BEFORE they click Capture & Solve (the previous UX silently sent a
  // 1x1 black PNG to the LLM, which replied "I can't see any coding
  // question" and confused Ade on his interview).
  useEffect(() => {
    if (permissionStatus === 'unchecked') {
      onCheckPermission();
    }
  }, [permissionStatus, onCheckPermission]);

  async function handleManualSolve() {
    if (manualProblem.trim()) {
      await onSolve(manualProblem.trim(), audioTranscript);
    }
  }

  // P0 fix 1.4 — open the window picker, let the candidate pick a window
  // (VS Code, LeetCode, browser, etc.) and capture from it instead of the
  // whole screen.
  async function openWindowPicker() {
    const wins = await screenCaptureService.listWindows();
    setWindowList(wins);
    setShowWindowPicker(true);
  }

  async function handlePickWindow(win: WindowSource) {
    const capture = await screenCaptureService.captureWindow(win.id);
    setShowWindowPicker(false);
    if (capture.ok) {
      setPickedWindowName(win.name);
      onCapture();
    } else {
      // Surface the error inline so the user knows why the picker didn't work.
      alert(`Window capture failed: ${capture.message}`);
    }
  }

  // Visual cue for the audio level meter (used when audio is on).
  const meterWidth = Math.min(100, Math.max(2, audioLevel * 100));

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* 2026-08-17 P0 fix — permission banner. If the macOS Screen
          Recording permission is not granted, the screenshot path returns
          a 1x1 black PNG and the LLM says "I can't see any coding
          question". Catch that BEFORE the user clicks Capture. */}
      {permissionStatus === 'denied' || permissionStatus === 'restricted' || permissionStatus === 'not-determined' ? (
        <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] leading-relaxed">
          <div className="font-semibold mb-0.5">⚠️ Screen Recording permission required</div>
          <div className="text-amber-200/80">
            {permissionMessage ||
              'Open System Settings → Privacy & Security → Screen Recording → enable Interview Copilot, then restart the app.'}
          </div>
        </div>
      ) : permissionStatus === 'unknown' ? (
        <div className="px-3 py-1.5 rounded-lg bg-gray-800/40 border border-gray-700/30 text-gray-400 text-[10px]">
          Checking screen-capture permission…
        </div>
      ) : null}

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onCapture}
          disabled={isGenerating}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-white font-medium text-xs border border-purple-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {isGenerating ? (
            <>
              <div className="w-2 h-2 rounded-full bg-white pulse-dot" />
              Analyzing...
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21,15 16,10 5,21" />
              </svg>
              {pickedWindowName ? `Capture: ${pickedWindowName.slice(0, 16)}` : 'Capture Screen & Solve'}
            </>
          )}
        </button>

        {/* P0 fix 1.4 — pick a specific window instead of the whole screen. */}
        <button
          onClick={openWindowPicker}
          disabled={isGenerating}
          className="px-2 py-2 rounded-lg bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 text-xs border border-gray-700/40 disabled:opacity-40 transition-all"
          title="Pick a specific window to capture (e.g. VS Code)"
        >
          🪟
        </button>

        {/* 2026-08-17 P0 fix — toggle system-audio capture (interviewer's
            voice). When ON, the audio transcript gets spliced into the
            LLM prompt alongside the screenshot so the model sees BOTH
            the on-screen LeetCode question AND what the interviewer said. */}
        <button
          onClick={isListening ? onStopAudio : onStartAudio}
          disabled={isGenerating}
          className={`px-2 py-2 rounded-lg text-xs border transition-all disabled:opacity-40 ${
            isListening
              ? 'bg-red-600/80 hover:bg-red-600 text-white border-red-500/40'
              : 'bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 border-gray-700/40'
          }`}
          title={isListening ? 'Stop capturing interviewer audio' : 'Start capturing interviewer audio (uses system audio loopback)'}
        >
          {isListening ? '🔴 Stop' : '🎤 Audio'}
        </button>

        {/* Language selector */}
        <select
          value={programmingLanguage}
          onChange={(e) => onSetLanguage(e.target.value)}
          className="px-2 py-2 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-300 text-[10px] focus:outline-none focus:border-purple-500/50"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>

      {/* 2026-08-17 P0 fix — live audio level + silence warning. Surfaces
          whether the system-audio loopback is actually picking up sound
          (vs. silently broken — wrong output device, denied permission,
          etc.). The 5-second silence warning mirrors InterviewMode. */}
      {isListening && (
        <div className="rounded-lg bg-gray-900/60 border border-red-700/30 px-2 py-1.5 flex items-center gap-2 fade-in">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 pulse-dot" />
            <span className="text-[9px] text-red-300 font-semibold uppercase tracking-wider">Listening</span>
          </div>
          <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all"
              style={{ width: `${meterWidth}%` }}
            />
          </div>
          <span className="text-[9px] text-gray-500 tabular-nums">{Math.round(audioLevel * 100)}%</span>
          {audioSilentSeconds > 5 && (
            <span className="text-[9px] text-amber-400" title="No audio detected — check macOS system-audio permission or your output device">
              ⚠ silent {Math.round(audioSilentSeconds)}s
            </span>
          )}
        </div>
      )}

      {/* 2026-08-17 P0 fix — last captured audio transcript preview. Shows
          the latest interviewer voice captured so the user knows audio is
          working and can copy it into the LLM context. */}
      {isListening && audioTranscript && (
        <div className="rounded-lg bg-gray-900/40 border border-gray-700/30 px-2 py-1.5 fade-in">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Last interviewer voice</div>
          <div className="text-[10px] text-gray-300 leading-snug max-h-12 overflow-y-auto">
            {audioTranscript.slice(-300)}
          </div>
        </div>
      )}

      {/* P0 fix 1.4 — window picker overlay. */}
      {showWindowPicker && (
        <div className="rounded-lg bg-gray-900/90 border border-gray-700/60 p-2 fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-gray-400 uppercase tracking-wider">Pick a window to capture</span>
            <button
              onClick={() => setShowWindowPicker(false)}
              className="text-[10px] text-gray-500 hover:text-gray-300"
            >
              ✕
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto grid grid-cols-2 gap-1.5">
            {windowList.length === 0 && (
              <div className="col-span-2 text-[10px] text-gray-500 italic px-2 py-2">
                No windows found. Make sure the target app is visible on screen.
              </div>
            )}
            {windowList.map((w) => (
              <button
                key={w.id}
                onClick={() => handlePickWindow(w)}
                className="flex flex-col items-stretch rounded border border-gray-700/40 hover:border-purple-500/60 bg-gray-800/40 hover:bg-gray-800/80 overflow-hidden text-left transition-all"
              >
                {w.thumbnail && (
                  <img src={w.thumbnail} alt={w.name} className="w-full h-16 object-cover bg-black" />
                )}
                <span className="text-[9px] text-gray-300 px-1.5 py-1 truncate">{w.name || '(untitled)'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual problem input */}
      <div className="flex flex-col gap-1.5">
        <textarea
          value={manualProblem}
          onChange={(e) => setManualProblem(e.target.value)}
          placeholder="Or paste the coding problem here..."
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-purple-500/50 resize-none transition-all"
        />
        <button
          onClick={handleManualSolve}
          disabled={!manualProblem.trim() || isGenerating}
          className="w-full py-1.5 rounded-lg bg-gray-700/60 hover:bg-gray-700 text-gray-300 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Solve Pasted Problem
        </button>
      </div>

      {/* Problem display (collapsible) */}
      {codingProblem && (
        <div className="rounded-lg bg-gray-800/30 border border-gray-700/30 overflow-hidden fade-in">
          <button
            onClick={() => setShowProblem(!showProblem)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[9px] text-orange-400 uppercase tracking-wider font-semibold hover:bg-gray-800/30 transition-all"
          >
            <span>Problem Detected</span>
            <span className="text-gray-600">{showProblem ? '▼' : '▶'}</span>
          </button>
          {showProblem && (
            <div className="px-3 py-2 border-t border-gray-700/20 text-gray-300 text-xs leading-relaxed max-h-24 overflow-y-auto">
              <div className="whitespace-pre-wrap">{codingProblem}</div>
            </div>
          )}
        </div>
      )}

      {/* Solution display */}
      {(codingSolution || isGenerating) && (
        <div className="flex-1 flex flex-col rounded-lg bg-gray-800/30 border border-purple-700/30 overflow-hidden fade-in">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/20 bg-gray-800/20">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-purple-400 uppercase tracking-wider font-semibold">Solution</span>
              {isGenerating && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 pulse-dot" />}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-600 px-1.5 py-0.5 rounded bg-gray-800/60">{programmingLanguage}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(codingSolution);
                }}
                className="text-[9px] text-gray-500 hover:text-gray-300 transition-all"
                title="Copy solution"
              >
                📋 Copy
              </button>
            </div>
          </div>
          <div
            ref={solutionRef}
            className="flex-1 overflow-y-auto px-3 py-2 text-gray-200 leading-relaxed"
            style={{ fontSize: Math.max(fontSize - 1, 11) }}
          >
            <pre className="whitespace-pre-wrap">
              <code>{codingSolution}</code>
            </pre>
            {isGenerating && <span className="inline-block w-1.5 h-3 bg-purple-400 ml-0.5 pulse-dot" />}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!codingSolution && !isGenerating && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-600 text-xs gap-2">
          <div className="text-2xl">💻</div>
          <div>Capture your screen or paste a problem</div>
          <div className="text-[10px] text-gray-700">AI will read the coding question and write the solution</div>
        </div>
      )}
    </div>
  );
}
