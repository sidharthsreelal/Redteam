'use client';

import { useApp } from '@/lib/store';
import { MODES } from '@/lib/modes';
import { Mode } from '@/lib/types';

const MODE_ACCENTS: Record<string, string> = {
  'stress-test': '#EF4444',
  'ooda-loop': '#0EA5E9',
  'first-principles': '#F97316',
  'inversion': '#8B5CF6',
  'temporal': '#F59E0B',
  'chat': '#14B8A6',
};

export default function ModeSelector() {
  const { state, dispatch } = useApp();

  return (
    <div className="flex flex-col items-center px-8 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-ghost mb-8">
        SELECT A MODE
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
        {MODES.map((mode: Mode) => {
          const isSelected = state.selectedMode?.id === mode.id;
          const accent = MODE_ACCENTS[mode.id];

          return (
            <button
              key={mode.id}
              id={`mode-${mode.id}`}
              onClick={() => dispatch({ type: 'SELECT_MODE', mode })}
              className="text-left p-5 rounded-lg transition-all duration-200"
              style={{
                background: isSelected ? '#131620' : 'var(--color-ink)',
                borderTop: isSelected ? `1px solid ${accent}` : '0.5px solid var(--color-stone)',
                borderRight: isSelected ? `1px solid ${accent}` : '0.5px solid var(--color-stone)',
                borderBottom: isSelected ? `1px solid ${accent}` : '0.5px solid var(--color-stone)',
                borderLeft: isSelected
                  ? `2px solid ${accent}`
                  : '0.5px solid var(--color-stone)',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  const el = e.currentTarget;
                  el.style.borderTopColor = 'var(--color-ash)';
                  el.style.borderRightColor = 'var(--color-ash)';
                  el.style.borderBottomColor = 'var(--color-ash)';
                  el.style.borderLeft = `2px solid ${accent}`;
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  const el = e.currentTarget;
                  el.style.borderTopColor = 'var(--color-stone)';
                  el.style.borderRightColor = 'var(--color-stone)';
                  el.style.borderBottomColor = 'var(--color-stone)';
                  el.style.borderLeft = '0.5px solid var(--color-stone)';
                }
              }}
            >
              <p className="font-mono text-xs text-cloud tracking-wide">{mode.name}</p>
              <p className="text-[11px] text-mist mt-1">{mode.tagline}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {mode.id === 'chat' ? (
                  <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: '#14B8A6' }}>
                    DIRECT · ONE NODE · CONTINUOUS
                  </span>
                ) : (
                  mode.frameworks.map((f) => (
                    <span
                      key={f.id}
                      className="font-mono text-[9px] text-ghost uppercase tracking-wider"
                    >
                      {f.title}
                      {f !== mode.frameworks[mode.frameworks.length - 1] && (
                        <span className="text-stone mx-1">·</span>
                      )}
                    </span>
                  ))
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
