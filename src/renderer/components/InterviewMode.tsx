import React, { useState, useRef, useEffect, useMemo } from 'react';
import { marked } from 'marked';
import type { ConversationEntry } from '../types';

marked.setOptions({ breaks: true, gfm: true });

interface Props {
  isListening: boolean;
  isGenerating: boolean;
  currentTranscript: string;
  suggestedAnswer: string;
  conversation: ConversationEntry[];
  onStartListening: () => void;
  onStopListening: () => void;
  onManualQuestion: (question: string) => void;
  onRegenerateAnswer: (question: string) => void;
  onAnswerThis: () => void;
  onClearTranscript: () => void;
  fontSize: number;
  audioLevel?: number;
  audioSilentSeconds?: number;
}

export default function InterviewMode({
  isListening,
  isGenerating,
  currentTranscript,
  suggestedAnswer,
  conversation,
  onStartListening,
  onStopListening,
  onManualQuestion,
  onRegenerateAnswer,
  onAnswerThis,
  onClearTranscript,
  fontSize,
  audioLevel = 0,
  audioSilentSeconds = 0,
}: Props) {
  const [manualInput, setManualInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (answerRef.current) {
      answerRef.current.scrollTop = answerRef.current.scrollHeight;
    }
  }, [suggestedAnswer]);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [conversation]);

  const renderedAnswer = useMemo(() => {
    if (!suggestedAnswer) return '';
    return marked.parse(suggestedAnswer) as string;
  }, [suggestedAnswer]);

  function handleSubmitManual(e: React.FormEvent) {
    e.preventDefault();
    if (manualInput.trim()) {
      onManualQuestion(manualInput.trim());
      setManualInput('');
    }
  }

  const lastQuestion = conversation.filter((c) => c.type === 'question').slice(-1)[0];

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Audio control row */}
      <div className="flex items-center gap-2">
        <button
          onClick={isListening ? onStopListening : onStartListening}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-xs transition-all ${
            isListening
              ? 'bg-red-600/80 hover:bg-red-600 text-white border border-red-500/40'
              : 'bg-blue-600/80 hover:bg-blue-600 text-white border border-blue-500/40'
          }`}
        >
          {isListening ? (
            <>
              <div className="w-2 h-2 rounded-full bg-white pulse-dot" />
              Stop Listening
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              Listen to Interviewer
            </>
          )}
        </button>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="px-2 py-2 rounded-lg bg-gray-800/60 hover:bg-gray-700/60 text-gray-400 hover:text-gray-200 text-xs border border-gray-700/40 transition-all"
        >
          {showHistory ? '✕' : `📋 ${conversation.length}`}
        </button>
      </div>

      {/* Live transcript + Answer This button */}
      {isListening && (
        <div className="rounded-lg bg-gray-800/40 border border-gray-700/30 fade-in overflow-hidden">
          <div className="px-3 py-2">
            <div className="text-[9px] text-gray-500 mb-1 uppercase tracking-wider flex items-center gap-2">
              <span>Hearing interviewer (system audio)</span>
            </div>
            {/* Real audio-level meter — driven by the AudioContext analyser
                in audioService. If the bar stays flat for 6+ seconds, the
                capture is silent (wrong output device / loopback denied). */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1.5 bg-gray-700/80 rounded-full overflow-hidden">
                <div
                  className="h-full transition-[width] duration-75 ease-out rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(2, audioLevel * 100))}%`,
                    background: `linear-gradient(to right, ${
                      audioLevel > 0.5
                        ? '#10b981, #facc15, #f97316, #ef4444'
                        : audioLevel > 0.1
                        ? '#10b981, #facc15'
                        : '#6b7280'
                    })`,
                  }}
                />
              </div>
              <span className="text-[9px] text-gray-500 font-mono w-10 text-right tabular-nums">
                {Math.round(audioLevel * 100)}%
              </span>
            </div>
            {audioSilentSeconds > 6 && (
              <div className="text-[9px] text-amber-400 mb-2 leading-snug">
                ⚠ No audio detected for {Math.round(audioSilentSeconds)}s. Check that
                <span className="text-amber-300"> Screen & System Audio Recording</span>
                {' '}is on for Interview Copilot in System Settings → Privacy & Security,
                and that your call's audio is routed through your Mac (not just Bluetooth headphones).
              </div>
            )}
            <div className="text-gray-300 text-xs leading-relaxed min-h-[20px] max-h-[80px] overflow-y-auto">
              {currentTranscript || <span className="text-gray-600 italic">Waiting for speech...</span>}
            </div>
          </div>
          {/* Action buttons below transcript */}
          <div className="flex gap-1.5 px-3 py-2 border-t border-gray-700/20 bg-gray-800/20">
            <button
              onClick={onAnswerThis}
              disabled={!currentTranscript.trim() || isGenerating}
              className="flex-1 py-1.5 rounded-md bg-green-600/80 hover:bg-green-600 text-white text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              ✨ Answer This
            </button>
            <button
              onClick={onClearTranscript}
              disabled={!currentTranscript.trim()}
              className="px-3 py-1.5 rounded-md bg-gray-700/60 hover:bg-gray-700 text-gray-300 text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Manual input */}
      <form onSubmit={handleSubmitManual} className="flex gap-1.5">
        <input
          type="text"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder="Type a question manually..."
          className="flex-1 px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all"
        />
        <button
          type="submit"
          disabled={!manualInput.trim() || isGenerating}
          className="px-3 py-1.5 rounded-lg bg-blue-600/70 hover:bg-blue-600 text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Ask
        </button>
      </form>

      {/* Conversation history (collapsible) */}
      {showHistory && conversation.length > 0 && (
        <div ref={historyRef} className="max-h-32 overflow-y-auto rounded-lg bg-gray-900/60 border border-gray-800/40 p-2 fade-in">
          <div className="text-[9px] text-gray-500 mb-1.5 uppercase tracking-wider">Conversation</div>
          {conversation.map((entry) => (
            <div key={entry.id} className="mb-1.5 last:mb-0">
              <span
                className={`text-[9px] font-medium ${
                  entry.speaker === 'interviewer'
                    ? 'text-orange-400'
                    : entry.speaker === 'ai'
                    ? 'text-blue-400'
                    : 'text-green-400'
                }`}
              >
                {entry.speaker === 'interviewer' ? 'Q' : entry.speaker === 'ai' ? 'AI' : 'You'}:
              </span>
              <span className="text-gray-400 text-[10px] ml-1 line-clamp-2">{entry.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Suggested answer — main display area */}
      {(suggestedAnswer || isGenerating) && (
        <div className="flex-1 flex flex-col rounded-lg bg-gray-800/30 border border-gray-700/30 overflow-hidden fade-in min-h-0">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/20 bg-gray-800/20 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-blue-400 uppercase tracking-wider font-semibold">Suggested Answer</span>
              {isGenerating && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 pulse-dot" />}
            </div>
            {lastQuestion && (
              <button
                onClick={() => onRegenerateAnswer(lastQuestion.text)}
                disabled={isGenerating}
                className="text-[9px] text-gray-500 hover:text-gray-300 disabled:opacity-40 transition-all"
              >
                ↻ Regenerate
              </button>
            )}
          </div>
          <div
            ref={answerRef}
            className="flex-1 overflow-y-auto px-3 py-2 text-gray-200 leading-relaxed min-h-0"
            style={{ fontSize: fontSize }}
          >
            <div className="prose prose-invert prose-sm max-w-none [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mb-1 [&_h2]:text-xs [&_h2]:font-bold [&_h2]:mb-1 [&_h2]:mt-2 [&_h3]:text-xs [&_h3]:font-semibold [&_p]:mb-1.5 [&_p]:leading-relaxed [&_ul]:my-1 [&_ul]:pl-4 [&_li]:mb-0.5 [&_li]:text-gray-200 [&_strong]:text-white [&_blockquote]:border-l-2 [&_blockquote]:border-blue-500/40 [&_blockquote]:pl-2 [&_blockquote]:text-gray-300 [&_code]:bg-gray-700/60 [&_code]:px-1 [&_code]:rounded [&_code]:text-blue-300" dangerouslySetInnerHTML={{ __html: renderedAnswer }} />
            {isGenerating && <span className="inline-block w-1.5 h-3 bg-blue-400 ml-0.5 pulse-dot" />}
          </div>
        </div>
      )}

      {/* Empty state — no answer yet */}
      {!suggestedAnswer && !isGenerating && !isListening && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-600 text-xs gap-2">
          <div className="text-2xl">🎤</div>
          <div>Listen to the interviewer or type a question</div>
          <div className="text-[10px] text-gray-700">AI will suggest answers when you tap "Answer This"</div>
        </div>
      )}

      {!suggestedAnswer && !isGenerating && isListening && !currentTranscript && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-600 text-xs gap-2">
          <div className="flex items-center gap-1">
            {[0.2, 0.4, 0.7, 1.0, 0.5].map((mult, i) => {
              // Bars scale with the actual audio level — silent capture → all bars small.
              const minH = 6;
              const maxH = 22;
              const h = Math.max(
                minH,
                Math.min(maxH, minH + (maxH - minH) * Math.min(1, audioLevel * 5) * mult)
              );
              return (
                <div
                  key={i}
                  className="w-1 rounded-full transition-[height] duration-75"
                  style={{
                    height: `${h}px`,
                    backgroundColor: audioLevel > 0.05 ? '#f87171' : '#4b5563',
                  }}
                />
              );
            })}
          </div>
          <div>
            {audioSilentSeconds > 6
              ? <span className="text-amber-400">No audio detected — check permissions</span>
              : 'Listening to system audio...'}
          </div>
          <div className="text-[10px] text-gray-700">Tap "Answer This" when the interviewer finishes a question</div>
        </div>
      )}
    </div>
  );
}
