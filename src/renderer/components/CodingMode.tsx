import React, { useState, useRef, useEffect } from 'react';

interface Props {
  isGenerating: boolean;
  codingProblem: string;
  codingSolution: string;
  programmingLanguage: string;
  onCapture: () => void;
  onSolve: (problem: string) => Promise<void>;
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
  onCapture,
  onSolve,
  onSetLanguage,
  fontSize,
}: Props) {
  const [manualProblem, setManualProblem] = useState('');
  const [showProblem, setShowProblem] = useState(true);
  const solutionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (solutionRef.current) {
      solutionRef.current.scrollTop = solutionRef.current.scrollHeight;
    }
  }, [codingSolution]);

  async function handleManualSolve() {
    if (manualProblem.trim()) {
      await onSolve(manualProblem.trim());
    }
  }

  return (
    <div className="flex flex-col gap-2 h-full">
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
              Capture Screen & Solve
            </>
          )}
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
