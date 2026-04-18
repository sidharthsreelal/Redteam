'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useApp } from '@/lib/store';
import { EXAMPLE_PROMPTS, EXAMPLE_PROMPTS_BY_MODE } from '@/lib/modes';
import ModeSelector from './ModeSelector';

export default function InputScreen() {
  const { state, dispatch, executeSession } = useApp();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const charCount = state.userInput.length;
  const canSubmit = charCount >= 15;

  // Pick 4 random prompts from the current mode's bank each time the mode changes
  const examplePrompts = useMemo(() => {
    const pool = state.selectedMode
      ? (EXAMPLE_PROMPTS_BY_MODE[state.selectedMode.id] ?? EXAMPLE_PROMPTS)
      : EXAMPLE_PROMPTS;
    // Fisher-Yates shuffle then take first 4
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, 4);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedMode?.id]);

  // Focus input and smoothly scroll to it when mode changes
  useEffect(() => {
    if (state.selectedMode) {
      // Use preventScroll to stop the browser's default "jump" on focus
      inputRef.current?.focus({ preventScroll: true });
      
      // Since the parent has style={{ scrollBehavior: 'smooth' }}, 
      // a simple scrollIntoView will now be perfectly smooth and non-jittery.
      inputContainerRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [state.selectedMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter -> just insert newline
        return;
      }
      e.preventDefault();
      if (canSubmit) {
        executeSession();
      }
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-smooth" style={{ scrollBehavior: 'smooth' }}>
      {/* Mode cards */}
      <div>
        <ModeSelector />
      </div>

      {/* Input area — appears when mode is selected */}
      {state.selectedMode && (
        <div ref={inputContainerRef} className="px-8 pb-8 transition-opacity duration-300 ease-out">
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
              border: `0.5px solid ${state.selectedMode.accent}44`,
              lineHeight: '1.7',
              transition: 'border-color 200ms ease, box-shadow 200ms ease',
              outline: 'none',
              boxShadow: 'none',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = state.selectedMode!.accent;
              e.target.style.boxShadow = `0 0 18px 4px ${state.selectedMode!.accent}22`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = `${state.selectedMode!.accent}44`;
              e.target.style.boxShadow = 'none';
            }}
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
                border: `0.5px solid ${state.selectedMode.accent}`,
                background: 'transparent',
                color: state.selectedMode.accent,
              }}
              onMouseEnter={(e) => {
                if (canSubmit) {
                  (e.target as HTMLButtonElement).style.background = state.selectedMode!.accent;
                  (e.target as HTMLButtonElement).style.color = 'var(--color-void)';
                }
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.background = 'transparent';
                (e.target as HTMLButtonElement).style.color = state.selectedMode!.accent;
              }}
            >
              EXECUTE →
            </button>
          </div>

          {/* Example prompts — 4 random from the current mode's bank of 15 */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            {examplePrompts.map((prompt, i) => (
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

