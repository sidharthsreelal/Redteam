'use client';

import { useApp } from '@/lib/store';
import { MODES } from '@/lib/modes';
import { Mode } from '@/lib/types';
import { useState } from 'react';

// Per-mode icon glyphs
const MODE_ICONS: Record<string, string> = {
  'stress-test':       '⧇',
  'ooda-loop':         '◎',
  'first-principles':  '⬡',
  'inversion':         '↻',
  'temporal':          '◷',
  'brainstorm':        '☍',
  'chat':              '◐',
};



// Brainstorm agent short labels (to match the framework-list density of other modes)
const BRAINSTORM_AGENTS = [
  'Problem Miner',
  'Gap Scanner',
  'Idea Generator',
  'Differentiation Lens',
  'Feasibility Check',
  'First Step',
];

export default function ModeSelector() {
  const { state, dispatch } = useApp();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div
      className="flex flex-col items-center w-full"
      style={{ padding: '40px 32px' }}
    >
      {/* ── Header ── */}
      <p
        className="font-mono uppercase mb-9"
        style={{
          fontSize: 10,
          letterSpacing: '0.25em',
          color: 'var(--color-ghost)',
        }}
      >
        SELECT A MODE
      </p>

      {/* ── Grid ── */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          maxWidth: 860,
        }}
      >
        {MODES.map((mode: Mode) => {
          const accent = mode.accent;
          const icon = MODE_ICONS[mode.id] ?? '·';
          const isSelected = state.selectedMode?.id === mode.id;
          const isHovered = hoveredId === mode.id;
          const active = isSelected || isHovered;
          const isChatMode = mode.id === 'chat';
          const isBrainstorm = mode.id === 'brainstorm';

          // Footer content: analytical modes → framework titles, brainstorm → 6 agent names, chat → meta
          const footerItems: string[] = isChatMode
            ? ['Direct', 'One node', 'Continuous']
            : isBrainstorm
              ? BRAINSTORM_AGENTS
              : mode.frameworks.map(f => f.title);

          return (
            <button
              key={mode.id}
              id={`mode-${mode.id}`}
              onClick={() => dispatch({ type: 'SELECT_MODE', mode })}
              onMouseEnter={() => setHoveredId(mode.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="text-left relative"
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '20px 22px 18px',
                borderRadius: 6,
                border: `1px solid ${active ? accent : 'var(--color-stone)'}`,
                background: active
                  ? `linear-gradient(145deg, color-mix(in srgb, ${accent} 7%, var(--color-ink)), var(--color-ink))`
                  : 'var(--color-ink)',
                boxShadow: active
                  ? `0 0 0 1px ${accent}22, inset 0 1px 0 ${accent}18`
                  : 'none',
                transition: 'border-color 150ms ease, box-shadow 150ms ease, background 150ms ease',
                cursor: 'pointer',
                // Chat spans all 3 columns; all others are uniform height
                gridColumn: isChatMode ? '1 / -1' : 'auto',
                minHeight: isChatMode ? 0 : 164,
              }}
            >
              {/* Accent dot — top right */}
              <span
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 18,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: active ? accent : 'var(--color-stone)',
                  transition: 'background 150ms ease',
                  flexShrink: 0,
                }}
              />

              {/* Icon */}
              <span
                style={{
                  fontSize: 17,
                  lineHeight: 1,
                  marginBottom: 11,
                  display: 'block',
                  color: active ? accent : 'var(--color-ash)',
                  transition: 'color 150ms ease',
                  userSelect: 'none',
                }}
              >
                {icon}
              </span>

              {/* Mode name */}
              <p
                className="font-mono uppercase"
                style={{
                  fontSize: 11,
                  letterSpacing: '0.15em',
                  color: active ? 'var(--color-cloud)' : 'var(--color-fog)',
                  transition: 'color 150ms ease',
                  marginBottom: 5,
                  fontWeight: 500,
                }}
              >
                {mode.name}
              </p>

              {/* Tagline */}
              <p
                style={{
                  fontSize: 12,
                  color: active ? 'var(--color-fog)' : 'var(--color-mist)',
                  lineHeight: 1.5,
                  transition: 'color 150ms ease',
                  fontFamily: 'var(--font-geist-sans), sans-serif',
                  flexGrow: 1,
                  paddingBottom: 14,
                }}
              >
                {mode.tagline}
              </p>

              {/* Divider */}
              <div
                style={{
                  height: '0.5px',
                  background: active ? `${accent}33` : 'var(--color-stone)',
                  marginBottom: 11,
                  transition: 'background 150ms ease',
                  flexShrink: 0,
                }}
              />

              {/* Footer: framework/agent names */}
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {footerItems.map((label, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
                    <span
                      className="font-mono uppercase"
                      style={{
                        fontSize: 9,
                        letterSpacing: '0.1em',
                        color: active
                          ? (isBrainstorm || isChatMode ? accent : 'var(--color-ghost)')
                          : 'var(--color-stone)',
                        transition: 'color 150ms ease',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                    </span>
                    {i < footerItems.length - 1 && (
                      <span
                        style={{
                          fontSize: 8,
                          color: 'var(--color-stone)',
                          margin: '0 5px',
                          opacity: 0.6,
                          flexShrink: 0,
                        }}
                      >
                        ·
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
