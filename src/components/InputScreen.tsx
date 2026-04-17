'use client';

import { useRef, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { EXAMPLE_PROMPTS } from '@/lib/modes';
import ModeSelector from './ModeSelector';

export default function InputScreen() {
  const { state, dispatch, executeSession } = useApp();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const charCount = state.userInput.length;
  const canSubmit = charCount >= 15;

  // Focus input when mode changes
  useEffect(() => {
    if (state.selectedMode) {
      inputRef.current?.focus();
    }
  }, [state.selectedMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
      executeSession();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Mode cards */}
      <ModeSelector />

      {/* Input area — appears when mode is selected */}
      {state.selectedMode && (
        <div className="px-8 pb-8 transition-all duration-300 ease-out">
          {/* Selected mode indicator */}
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: state.selectedMode.accent }}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ghost">
              {state.selectedMode.name}
            </p>
          </div>

          {/* Textarea */}
          <textarea
            id="idea-input"
            ref={inputRef}
            autoFocus
            value={state.userInput}
            onChange={(e) => dispatch({ type: 'SET_INPUT', input: e.target.value.slice(0, 3000) })}
            onKeyDown={handleKeyDown}
            placeholder="Describe your idea, plan, decision, or argument..."
            className="w-full h-[160px] bg-void text-cloud text-sm px-4 py-3 resize-none outline-none placeholder:text-ghost"
            style={{
              border: '0.5px solid var(--color-stone)',
              lineHeight: '1.7',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--color-signal)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--color-stone)')}
          />

          {/* Counter + Submit */}
          <div className="flex items-center justify-between mt-3">
            <span className="font-mono text-[10px] text-ghost">
              {charCount} / 3000
            </span>
            <button
              id="execute-btn"
              onClick={executeSession}
              disabled={!canSubmit}
              className="font-mono text-xs uppercase tracking-[0.15em] px-6 py-2.5 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                border: '0.5px solid var(--color-signal)',
                background: 'transparent',
                color: 'var(--color-signal)',
              }}
              onMouseEnter={(e) => {
                if (canSubmit) {
                  (e.target as HTMLButtonElement).style.background = 'var(--color-signal)';
                  (e.target as HTMLButtonElement).style.color = 'var(--color-void)';
                }
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.background = 'transparent';
                (e.target as HTMLButtonElement).style.color = 'var(--color-signal)';
              }}
            >
              EXECUTE →
            </button>
          </div>

          {/* Example prompts */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            {EXAMPLE_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => {
                  dispatch({ type: 'SET_INPUT', input: prompt });
                  inputRef.current?.focus();
                }}
                className="text-left text-xs text-ghost p-3 rounded transition-colors duration-150 hover:text-fog"
                style={{ border: '0.5px solid var(--color-stone)' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-ash)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-stone)';
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Ghost node preview */}
          {state.selectedMode && (
            <div className="mt-8 flex items-center justify-center gap-6 opacity-20">
              {/* Input ghost node */}
              <div
                className="w-16 h-10 rounded"
                style={{ border: '0.5px dashed var(--color-ghost)' }}
              />
              {/* Lines + Framework nodes */}
              <div className="flex items-center gap-4">
                {state.selectedMode.frameworks.map((f) => (
                  <div key={f.id} className="flex items-center gap-2">
                    <div className="w-8 h-px bg-ghost" />
                    <div
                      className="w-12 h-10 rounded"
                      style={{ border: '0.5px dashed var(--color-ghost)' }}
                    />
                  </div>
                ))}
              </div>
              {/* Synthesis ghost node */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-px bg-ghost" />
                <div
                  className="w-16 h-10 rounded"
                  style={{ border: '0.5px dashed var(--color-ghost)' }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
