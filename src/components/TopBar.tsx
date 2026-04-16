'use client';

import { useApp } from '@/lib/store';
import { useEffect, useState, useRef } from 'react';


export default function TopBar() {
  const { state, dispatch } = useApp();
  const { activeSession, selectedMode } = state;
  const [clock, setClock] = useState('');
  const [showReset, setShowReset] = useState(false);
  const resetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Close reset popup on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (resetRef.current && !resetRef.current.contains(e.target as Node)) {
        setShowReset(false);
      }
    };
    if (showReset) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showReset]);

  if (!activeSession) return null;

  const completedCount = activeSession.frameworkOutputs.filter(
    (fo) => fo.status === 'complete' || fo.status === 'error'
  ).length;
  const totalCount = activeSession.frameworkOutputs.length;
  const synthesisComplete = activeSession.synthesisOutput.status === 'complete';
  const isComplete = completedCount === totalCount && synthesisComplete;
  const statusLabel = isComplete ? 'COMPLETE' : 'EXECUTING';
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="flex-shrink-0">
      <div
        className="h-9 bg-ink flex items-center px-4 gap-4"
        style={{ borderBottom: '0.5px solid var(--color-stone)' }}
      >
        {/* Mode name */}
        <span className="font-mono text-[10px] text-ghost uppercase tracking-[0.15em] hidden sm:block">
          {selectedMode?.name}
        </span>

        {/* Divider */}
        <span className="text-stone hidden sm:block">|</span>

        {/* Status */}
        <span
          className="font-mono text-[10px] uppercase tracking-[0.15em]"
          style={{ color: isComplete ? 'var(--color-accent-emerald)' : 'var(--color-signal)' }}
        >
          {statusLabel}
        </span>

        {/* Progress */}
        <span className="font-mono text-[10px] text-ghost">
          {completedCount}&nbsp;/&nbsp;{totalCount}
        </span>

        <div className="flex-1" />

        {/* Reset */}
        <div className="relative" ref={resetRef}>
          <button
            onClick={() => setShowReset((v) => !v)}
            className="font-mono text-[10px] text-ghost uppercase tracking-[0.15em] hover:text-fog transition-colors"
          >
            RESET
          </button>
          {showReset && (
            <div
              className="absolute right-0 top-8 bg-ink rounded z-50 p-4 w-60"
              style={{ border: '0.5px solid var(--color-stone)' }}
            >
              <p className="text-xs text-fog mb-3 leading-relaxed">
                Reset session? All results will be lost.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    dispatch({ type: 'NEW_SESSION' });
                    setShowReset(false);
                  }}
                  className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 transition-colors hover:bg-slate"
                  style={{
                    border: '0.5px solid #EF4444',
                    color: '#EF4444',
                  }}
                >
                  CONFIRM
                </button>
                <button
                  onClick={() => setShowReset(false)}
                  className="font-mono text-[10px] uppercase tracking-wider text-ghost px-3 py-1.5 transition-colors hover:bg-slate"
                  style={{ border: '0.5px solid var(--color-stone)' }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clock */}
        <span className="font-mono text-[10px] text-ghost hidden sm:block">{clock}</span>
      </div>

      {/* Progress bar */}
      {!isComplete && (
        <div className="h-px bg-void">
          <div
            className="h-full transition-all duration-700 ease-out"
            style={{
              width: `${progressPct}%`,
              background: 'var(--color-signal)',
            }}
          />
        </div>
      )}
    </div>
  );
}
