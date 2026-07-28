import React from 'react';
import type { AppMode } from '../types';
import type { LLMProvider } from '../services/llmService';
import { PROVIDER_MODELS } from '../services/llmService';

interface Props {
  mode: AppMode;
  isListening: boolean;
  isScreenCapturing: boolean;
  isGenerating: boolean;
  provider: LLMProvider;
  model: string;
  onMinimize: () => void;
  onStealth: () => void;
  onSettings: () => void;
}

export default function OverlayHeader({
  mode,
  isListening,
  isScreenCapturing,
  isGenerating,
  provider,
  model,
  onMinimize,
  onStealth,
  onSettings,
}: Props) {
  const providerLabel = PROVIDER_MODELS[provider]?.label || provider;
  const modelName = PROVIDER_MODELS[provider]?.models.find((m) => m.id === model)?.name || model;

  return (
    <div className="drag-region flex items-center justify-between px-3 py-2 border-b border-gray-800/60 bg-gray-900/40">
      <div className="flex items-center gap-2 no-drag">
        {/* Status indicators */}
        <div className="flex items-center gap-1.5">
          {isListening && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 pulse-dot" />
              <span className="text-[9px] text-red-400 font-medium">LIVE</span>
            </div>
          )}
          {isScreenCapturing && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 pulse-dot" />
              <span className="text-[9px] text-blue-400 font-medium">SCREEN</span>
            </div>
          )}
          {isGenerating && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 pulse-dot" />
              <span className="text-[9px] text-amber-400 font-medium">THINKING</span>
            </div>
          )}
          {!isListening && !isScreenCapturing && !isGenerating && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[9px] text-green-400 font-medium">READY</span>
            </div>
          )}
        </div>

        {/* Model badge */}
        <div className="px-2 py-0.5 rounded-full bg-gray-800/80 border border-gray-700/40">
          <span className="text-[9px] text-gray-400">{modelName}</span>
        </div>
      </div>

      {/* Title */}
      <div className="text-[10px] font-semibold text-gray-300 tracking-wider">
        INTERVIEW COPILOT
      </div>

      {/* Window controls */}
      <div className="flex items-center gap-1 no-drag">
        <button
          onClick={onSettings}
          className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 transition-all"
          title="Settings"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          onClick={onMinimize}
          className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 transition-all"
          title="Minimize"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
