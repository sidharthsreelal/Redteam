'use client';

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/lib/store';
import type { SessionMemory } from '@/lib/types';
import Backdrop from './Backdrop';

export default function MemoryPanel() {
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pulse, setPulse] = useState(false);
  const prevMemoryRef = useRef<number | undefined>(undefined);

  const sessionMemory = state.activeSession?.sessionMemory;

  // Pulse animation when new memory is written
  useEffect(() => {
    if (sessionMemory?.lastUpdatedAt && sessionMemory.lastUpdatedAt !== prevMemoryRef.current) {
      prevMemoryRef.current = sessionMemory.lastUpdatedAt;
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 2000);
      return () => clearTimeout(t);
    }
  }, [sessionMemory?.lastUpdatedAt]);

  // Close on Escape key (handled by Backdrop)

  return (
    <div className="relative" ref={panelRef}>
      {/* MEMORY pill button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2 py-0.5 transition-all duration-200"
        style={{
          background: 'transparent',
          border: '0.5px solid var(--color-stone)',
          borderRadius: 9999,
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-ash)';
          const txt = e.currentTarget.querySelector('.memory-text') as HTMLElement;
          if (txt) txt.style.color = 'var(--color-fog)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-stone)';
          const txt = e.currentTarget.querySelector('.memory-text') as HTMLElement;
          if (txt) txt.style.color = 'var(--color-ghost)';
        }}
      >
        {/* Cyan dot when memory exists */}
        {sessionMemory && (
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#06B6D4',
              display: 'inline-block',
              flexShrink: 0,
              animation: pulse ? 'memoryPulse 1s ease-in-out 2' : 'none',
            }}
          />
        )}
        <span
          className="memory-text font-mono text-ghost"
          style={{
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          SESSION MEMORY
        </span>
      </button>

      {/* Floating Memory Panel */}
      {open && (
        <>
          <Backdrop onClose={() => setOpen(false)} zIndex={49} />
          <div
            className="absolute right-0 top-8 z-50"
            style={{
              width: 340,
              maxHeight: 420,
              background: 'var(--color-ink)',
              border: '0.5px solid var(--color-stone)',
              borderRadius: 6,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title row */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '0.5px solid var(--color-stone)' }}
            >
              <span
                className="font-mono"
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  color: 'var(--color-cloud)',
                }}
              >
                SESSION MEMORY
              </span>
              <div className="flex items-center gap-3">
                {sessionMemory && (
                  <span className="font-mono text-ghost" style={{ fontSize: 9 }}>
                    Round {sessionMemory.roundCount}
                  </span>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-ghost hover:text-fog transition-colors"
                  style={{ fontSize: 12 }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-4 py-3">
              {!sessionMemory ? (
                <p
                  className="text-center"
                  style={{
                    fontFamily: 'var(--font-geist-sans), sans-serif',
                    fontSize: 12,
                    color: 'var(--color-mist)',
                    lineHeight: 1.6,
                    padding: '16px 0',
                  }}
                >
                  Memory will be written after this round completes.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <MemorySection label="CORE IDEA" value={sessionMemory.coreIdea} />
                  <MemoryListSection label="ESTABLISHED" items={sessionMemory.establishedFacts} />
                  <MemoryListSection label="KEY INSIGHTS" items={sessionMemory.keyInsights} />
                  <MemoryListSection label="OPEN QUESTIONS" items={sessionMemory.openQuestions} />
                  <MemorySection label="CURRENT DIRECTION" value={sessionMemory.currentDirection} />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes memoryPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
}

function MemorySection({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="font-mono"
        style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: 'var(--color-ghost)',
          marginBottom: 4,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-geist-sans), sans-serif',
          fontSize: 12,
          color: 'var(--color-fog)',
          lineHeight: 1.6,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function MemoryListSection({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p
        className="font-mono"
        style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: 'var(--color-ghost)',
          marginBottom: 4,
        }}
      >
        {label}
      </p>
      {items.map((item, i) => (
        <p
          key={i}
          style={{
            fontFamily: 'var(--font-geist-sans), sans-serif',
            fontSize: 12,
            color: 'var(--color-fog)',
            lineHeight: 1.6,
          }}
        >
          <span style={{ color: 'var(--color-ghost)', marginRight: 6 }}>·</span>
          {item}
        </p>
      ))}
    </div>
  );
}
