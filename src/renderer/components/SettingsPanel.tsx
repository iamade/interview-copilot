import React from 'react';
import type { SettingsState, UserContext } from '../types';
import type { LLMProvider } from '../services/llmService';
import { PROVIDER_MODELS } from '../services/llmService';

// 2026-08-17 — engine quick-select: just OAuth/Gateway vs Direct API.
// The user wanted only 2 options (not 3) since the previous 3-option
// "Ollama / GLM 5.1 / Direct API" layout was confusing — the new
// design treats Ollama and GLM as just providers under the OAuth
// bucket, not engines of their own.
const ENGINES: { key: 'oauth' | 'direct'; label: string; sub: string }[] = [
  {
    key: 'oauth',
    label: 'OAuth / Gateway',
    sub: 'OpenClaw-managed keys (Ollama, OpenRouter, Featherless, HF). Free tier available.',
  },
  {
    key: 'direct',
    label: 'Direct API',
    sub: "Provider's own key (Anthropic, OpenAI, Gemini, Qwen, GLM, Kimi). PAYG.",
  },
];

export function EngineSelector({
  settings,
  onUpdateSettings,
}: {
  settings: SettingsState;
  onUpdateSettings: (s: SettingsState) => void;
}) {
  return (
    <div className="mb-2">
      <label className="text-[10px] text-gray-400 mb-1 block">Engine</label>
      <div className="grid grid-cols-2 gap-1.5">
        {ENGINES.map((e) => {
          const selected = settings.engine === e.key;
          return (
            <button
              key={e.key}
              onClick={() => {
                if (settings.engine === e.key) return;
                // Switch engine: pick a sensible default provider/model
                // for the new engine so the dropdown isn't empty.
                let newProvider: LLMProvider = settings.provider;
                let newModel: string = settings.model;
                if (e.key === 'oauth') {
                  // Switch to ollama_cloud + free deepseek-v4-pro
                  newProvider = 'ollama_cloud';
                  newModel = 'deepseek-v4-pro:cloud';
                } else {
                  // Switch to anthropic + claude-sonnet-5
                  newProvider = 'anthropic';
                  newModel = 'claude-sonnet-5';
                }
                onUpdateSettings({
                  ...settings,
                  engine: e.key,
                  provider: newProvider,
                  model: newModel,
                });
              }}
              className={`flex flex-col items-start px-2 py-1.5 rounded-lg border text-left transition-all ${
                selected
                  ? 'bg-blue-600/30 border-blue-400/60 text-white'
                  : 'bg-gray-800/40 border-gray-700/40 text-gray-300 hover:border-gray-500/60'
              }`}
            >
              <span className="text-[11px] font-semibold">{e.label}</span>
              <span className="text-[8px] text-gray-400 leading-tight">{e.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  settings: SettingsState;
  onUpdateSettings: (s: SettingsState) => void;
  userContext: UserContext;
  onUpdateContext: (ctx: UserContext) => void;
}

export default function SettingsPanel({ settings, onUpdateSettings, userContext, onUpdateContext }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-semibold text-gray-300 mb-1">Settings</div>

      {/* AI Provider & Model */}
      <section>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5 font-semibold">AI Configuration</div>

        {/* Engine quick-select — Ollama (default) / Featherless / Direct */}
        <EngineSelector settings={settings} onUpdateSettings={onUpdateSettings} />

        <div className="flex flex-col gap-2">
          <div>
            <label className="text-[10px] text-gray-400 mb-0.5 block">Provider</label>
            <select
              value={settings.provider}
              onChange={(e) => {
                const provider = e.target.value as LLMProvider;
                const firstModel = PROVIDER_MODELS[provider]?.models[0]?.id || '';
                onUpdateSettings({ ...settings, provider, model: firstModel });
              }}
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs focus:outline-none focus:border-blue-500/50"
            >
              {Object.entries(PROVIDER_MODELS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 mb-0.5 block">Model</label>
            <select
              value={settings.model}
              onChange={(e) => onUpdateSettings({ ...settings, model: e.target.value })}
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs focus:outline-none focus:border-blue-500/50"
            >
              {PROVIDER_MODELS[settings.provider]?.models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* API Keys for all providers */}
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1 font-semibold">API Keys</div>
          {Object.entries(PROVIDER_MODELS)
            .filter(([key]) => key !== 'ollama')
            .map(([key, val]) => (
              <div key={key}>
                <label className="text-[10px] text-gray-400 mb-0.5 block">{val.label}</label>
                <input
                  type="password"
                  value={settings.apiKeys[key] || ''}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      apiKeys: { ...settings.apiKeys, [key]: e.target.value },
                    })
                  }
                  placeholder={`${val.label} API key...`}
                  className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                />
              </div>
            ))}

          {/* Ollama endpoint */}
          <div>
            <label className="text-[10px] text-gray-400 mb-0.5 block">Ollama Endpoint</label>
            <input
              type="text"
              value={settings.ollamaEndpoint}
              onChange={(e) => onUpdateSettings({ ...settings, ollamaEndpoint: e.target.value })}
              placeholder="http://localhost:11434"
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* OpenClaw gateway endpoint (Ollama / Featherless) */}
          <div>
            <label className="text-[10px] text-gray-400 mb-0.5 block">OpenClaw Gateway Endpoint</label>
            <input
              type="text"
              value={settings.customEndpoints['gateway'] || ''}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  customEndpoints: { ...settings.customEndpoints, gateway: e.target.value },
                })
              }
              placeholder="http://localhost:18789/v1/chat/completions"
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
            />
            <div className="text-[9px] text-gray-600 mt-0.5">Leave blank to use localhost:18789 (OpenClaw daemon).</div>
          </div>

          {/* OpenRouter-backed OpenClaw endpoint (legacy) */}
          <div>
            <label className="text-[10px] text-gray-400 mb-0.5 block">OpenClaw Endpoint</label>
            <input
              type="text"
              value={settings.customEndpoints['openclaw'] || ''}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  customEndpoints: { ...settings.customEndpoints, openclaw: e.target.value },
                })
              }
              placeholder="https://your-openclaw-endpoint.com/v1/chat/completions"
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>
      </section>

      {/* Transcription */}
      <section>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5 font-semibold">Transcription</div>
        <div>
          <label className="text-[10px] text-gray-400 mb-0.5 block">Speech-to-Text Method</label>
          <select
            value={settings.transcriptionMode}
            onChange={(e) =>
              onUpdateSettings({ ...settings, transcriptionMode: e.target.value as 'browser' | 'whisper' })
            }
            className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs focus:outline-none focus:border-blue-500/50"
          >
            <option value="whisper">Local Whisper — faster-whisper (Default, on-device)</option>
            <option value="browser">Browser Speech Recognition (Free, unreliable in app)</option>
          </select>
          <div className="text-[9px] text-gray-600 mt-0.5">
            {settings.transcriptionMode === 'whisper'
              ? 'Runs on-device via the local faster-whisper server. No API key, no data leaves your Mac.'
              : 'Built-in Chrome speech recognition — usually fails inside Electron; falls back to local Whisper.'}
          </div>
        </div>
      </section>

      {/* Overlay appearance */}
      <section>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5 font-semibold">Appearance</div>

        <div className="flex flex-col gap-2">
          <div>
            <label className="text-[10px] text-gray-400 mb-0.5 flex items-center justify-between">
              <span>Font Size</span>
              <span className="text-gray-600">{settings.fontSize}px</span>
            </label>
            <input
              type="range"
              min="10"
              max="20"
              value={settings.fontSize}
              onChange={(e) => onUpdateSettings({ ...settings, fontSize: parseInt(e.target.value) })}
              className="w-full h-1 rounded-lg appearance-none bg-gray-700 cursor-pointer"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-400 mb-0.5 flex items-center justify-between">
              <span>Overlay Opacity</span>
              <span className="text-gray-600">{Math.round(settings.overlayOpacity * 100)}%</span>
            </label>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={settings.overlayOpacity}
              onChange={(e) => {
                const opacity = parseFloat(e.target.value);
                onUpdateSettings({ ...settings, overlayOpacity: opacity });
                window.electronAPI?.setOpacity(opacity);
              }}
              className="w-full h-1 rounded-lg appearance-none bg-gray-700 cursor-pointer"
            />
          </div>
        </div>
      </section>

      {/* Keyboard shortcuts reference */}
      <section>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5 font-semibold">Keyboard Shortcuts</div>
        <div className="flex flex-col gap-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-gray-400">Toggle overlay</span>
            <kbd className="px-1.5 py-0.5 bg-gray-800/80 rounded text-gray-500 border border-gray-700/40">Ctrl+Shift+I</kbd>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Stealth mode</span>
            <kbd className="px-1.5 py-0.5 bg-gray-800/80 rounded text-gray-500 border border-gray-700/40">Ctrl+Shift+H</kbd>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Open settings</span>
            <kbd className="px-1.5 py-0.5 bg-gray-800/80 rounded text-gray-500 border border-gray-700/40">Ctrl+Shift+S</kbd>
          </div>
        </div>
      </section>
    </div>
  );
}
