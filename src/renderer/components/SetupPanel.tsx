import React, { useState, useRef } from 'react';
import type { UserContext, SettingsState } from '../types';
import type { LLMProvider } from '../services/llmService';
import { PROVIDER_MODELS } from '../services/llmService';
import { EngineSelector } from './SettingsPanel';

interface Props {
  userContext: UserContext;
  onUpdateContext: (ctx: UserContext) => void;
  onStartInterview: () => void;
  onStartCoding: () => void;
  settings: SettingsState;
  onUpdateSettings: (s: SettingsState) => void;
}

export default function SetupPanel({
  userContext,
  onUpdateContext,
  onStartInterview,
  onStartCoding,
  settings,
  onUpdateSettings,
}: Props) {
  const [activeTab, setActiveTab] = useState<'context' | 'model'>('context');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFieldRef = useRef<'resumeText' | 'jobDescription' | 'stories'>('resumeText');

  async function handleFileUpload(field: 'resumeText' | 'jobDescription' | 'stories') {
    const api = window.electronAPI;

    if (api?.openFile) {
      // Electron native file dialog
      try {
        const result = await api.openFile({
          title: `Select ${field === 'resumeText' ? 'Resume' : field === 'jobDescription' ? 'Job Description' : 'Stories'} file`,
          filters: [{ name: 'Documents', extensions: ['txt', 'md', 'pdf', 'docx'] }],
        });

        if (result) {
          onUpdateContext({ ...userContext, [field]: result.content });
        }
      } catch (err) {
        console.error('Electron file dialog failed, falling back to web picker:', err);
        triggerWebFilePicker(field);
      }
    } else {
      // Web fallback — use browser file input
      triggerWebFilePicker(field);
    }
  }

  function triggerWebFilePicker(field: 'resumeText' | 'jobDescription' | 'stories') {
    pendingFieldRef.current = field;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  async function handleWebFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const field = pendingFieldRef.current;

    try {
      let content = '';
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'txt' || ext === 'md') {
        content = await file.text();
      } else if (ext === 'docx') {
        // Extract text from DOCX (it's a zip of XML files)
        content = await extractDocxText(file);
      } else if (ext === 'pdf') {
        content = `[PDF file: ${file.name}]\nPDF text extraction works best in the Electron app.\nPlease copy-paste the text from your PDF instead, or use a .txt/.md/.docx file.`;
      } else {
        content = await file.text();
      }

      onUpdateContext({ ...userContext, [field]: content });
    } catch (err: any) {
      console.error('File read failed:', err);
      // Last resort: try reading as text
      try {
        const content = await file.text();
        onUpdateContext({ ...userContext, [field]: content });
      } catch {
        alert(`Could not read file: ${err.message}`);
      }
    }
  }

  async function extractDocxText(file: File): Promise<string> {
    // Read DOCX as ArrayBuffer, find document.xml in the zip, strip XML tags
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Simple ZIP parser — find 'word/document.xml' entry
    // Look for the local file header signatures (PK\x03\x04)
    const decoder = new TextDecoder('utf-8');
    let docXml = '';

    // Use JSZip-like approach: find the central directory
    // For simplicity, search for 'word/document.xml' in the raw bytes
    const fullText = decoder.decode(uint8);

    // Find the XML content between the zip markers
    const xmlStart = fullText.indexOf('<?xml');
    if (xmlStart === -1) {
      // Fallback: just try reading as text
      return file.text();
    }

    // Try to extract using the browser's built-in capabilities
    // Use a different approach: read the file content and find document.xml
    try {
      // Simple approach: find the word/document.xml content in the zip
      const blob = new Blob([arrayBuffer]);
      const text = await blob.text();

      // Look for the document body content
      const bodyMatch = text.match(/<w:body>([\s\S]*?)<\/w:body>/);
      if (bodyMatch) {
        docXml = bodyMatch[1];
      } else {
        return `[DOCX file: ${file.name}]\nCould not extract text. Please paste the content manually.`;
      }
    } catch {
      return `[DOCX file: ${file.name}]\nCould not extract text. Please paste the content manually.`;
    }

    // Strip XML tags to get plain text
    return docXml
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim() || `[DOCX file: ${file.name}]\nCould not extract text. Please paste the content manually.`;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Hidden file input for web fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.docx,.pdf"
        onChange={handleWebFileChange}
        className="hidden"
      />

      {/* Quick start buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onStartInterview}
          className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-gradient-to-br from-blue-600/30 to-blue-800/20 border border-blue-500/30 hover:border-blue-400/50 text-white transition-all hover:scale-[1.02]"
        >
          <span className="text-lg">🎤</span>
          <span className="text-xs font-medium">Interview Mode</span>
          <span className="text-[9px] text-gray-400">Audio + AI Answers</span>
        </button>
        <button
          onClick={onStartCoding}
          className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-gradient-to-br from-purple-600/30 to-purple-800/20 border border-purple-500/30 hover:border-purple-400/50 text-white transition-all hover:scale-[1.02]"
        >
          <span className="text-lg">💻</span>
          <span className="text-xs font-medium">Coding Mode</span>
          <span className="text-[9px] text-gray-400">Screen Capture + Solver</span>
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-800/40 rounded-lg p-0.5">
        <button
          onClick={() => setActiveTab('context')}
          className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all ${
            activeTab === 'context' ? 'bg-gray-700/80 text-white' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Job Context
        </button>
        <button
          onClick={() => setActiveTab('model')}
          className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all ${
            activeTab === 'model' ? 'bg-gray-700/80 text-white' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          AI Model
        </button>
      </div>

      {activeTab === 'context' && (
        <div className="flex flex-col gap-2">
          {/* Company & Role */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5 block">Company</label>
              <input
                type="text"
                value={userContext.companyName}
                onChange={(e) => onUpdateContext({ ...userContext, companyName: e.target.value })}
                placeholder="e.g., Arcus Power"
                className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5 block">Role</label>
              <input
                type="text"
                value={userContext.roleName}
                onChange={(e) => onUpdateContext({ ...userContext, roleName: e.target.value })}
                placeholder="e.g., Software Engineer"
                className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>

          {/* Resume */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[9px] text-gray-500 uppercase tracking-wider">Resume</label>
              <button
                onClick={() => handleFileUpload('resumeText')}
                className="text-[9px] text-blue-400 hover:text-blue-300 transition-all"
              >
                📁 Upload
              </button>
            </div>
            <textarea
              value={userContext.resumeText}
              onChange={(e) => onUpdateContext({ ...userContext, resumeText: e.target.value })}
              placeholder="Paste your resume text here or upload a file..."
              rows={3}
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none"
            />
            {userContext.resumeText && (
              <div className="text-[9px] text-green-500 mt-0.5">
                ✓ {userContext.resumeText.length} chars loaded
              </div>
            )}
          </div>

          {/* Job Description */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[9px] text-gray-500 uppercase tracking-wider">Job Description</label>
              <button
                onClick={() => handleFileUpload('jobDescription')}
                className="text-[9px] text-blue-400 hover:text-blue-300 transition-all"
              >
                📁 Upload
              </button>
            </div>
            <textarea
              value={userContext.jobDescription}
              onChange={(e) => onUpdateContext({ ...userContext, jobDescription: e.target.value })}
              placeholder="Paste the job description here..."
              rows={3}
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none"
            />
          </div>

          {/* Stories */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[9px] text-gray-500 uppercase tracking-wider">Stories / Experiences</label>
              <button
                onClick={() => handleFileUpload('stories')}
                className="text-[9px] text-blue-400 hover:text-blue-300 transition-all"
              >
                📁 Upload
              </button>
            </div>
            <textarea
              value={userContext.stories}
              onChange={(e) => onUpdateContext({ ...userContext, stories: e.target.value })}
              placeholder="Add behavioral stories, achievements, or project details..."
              rows={2}
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none"
            />
          </div>

          {/* Additional notes */}
          <div>
            <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5 block">Additional Notes</label>
            <textarea
              value={userContext.additionalNotes}
              onChange={(e) => onUpdateContext({ ...userContext, additionalNotes: e.target.value })}
              placeholder="Any extra context (e.g., focus areas, things to avoid)..."
              rows={2}
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none"
            />
          </div>
        </div>
      )}

      {activeTab === 'model' && (
        <div className="flex flex-col gap-2">
          {/* Engine quick-select — Ollama (default) / Featherless / Direct */}
          <EngineSelector settings={settings} onUpdateSettings={onUpdateSettings} />

          {/* Provider */}
          <div>
            <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5 block">AI Provider (advanced)</label>
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
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5 block">Model</label>
            <select
              value={settings.model}
              onChange={(e) => onUpdateSettings({ ...settings, model: e.target.value })}
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs focus:outline-none focus:border-blue-500/50"
            >
              {PROVIDER_MODELS[settings.provider]?.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* API Key for selected provider (including Ollama Cloud) */}
          <div>
            <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5 block">
              {settings.provider === 'ollama' ? 'Ollama Cloud API Key' : 'API Key'}
            </label>
            <input
              type="password"
              value={settings.apiKeys[settings.provider] || ''}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  apiKeys: { ...settings.apiKeys, [settings.provider]: e.target.value },
                })
              }
              placeholder={settings.provider === 'ollama' ? 'Enter Ollama Cloud API key...' : `Enter ${PROVIDER_MODELS[settings.provider]?.label} API key...`}
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* Ollama endpoint */}
          {settings.provider === 'ollama' && (
            <div>
              <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5 block">Ollama Cloud Endpoint</label>
              <input
                type="text"
                value={settings.ollamaEndpoint}
                onChange={(e) => onUpdateSettings({ ...settings, ollamaEndpoint: e.target.value })}
                placeholder="http://localhost:11434"
                className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          )}

          {/* Custom endpoint for OpenClaw/Custom */}
          {(settings.provider === 'openclaw' || settings.provider === 'custom') && (
            <div>
              <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5 block">Endpoint URL</label>
              <input
                type="text"
                value={settings.customEndpoints[settings.provider] || ''}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    customEndpoints: { ...settings.customEndpoints, [settings.provider]: e.target.value },
                  })
                }
                placeholder="https://api.example.com/v1/chat/completions"
                className="w-full px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
