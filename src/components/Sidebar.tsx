'use client';

import { useApp } from '@/lib/store';
import { Session } from '@/lib/types';
import { useEffect } from 'react';

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { state, dispatch } = useApp();

  useEffect(() => {
    try {
      const stored = localStorage.getItem('redteam-sessions');
      if (stored) {
        const sessions: Session[] = JSON.parse(stored);
        dispatch({ type: 'LOAD_SESSIONS', sessions });
      }
    } catch {
      // silently fail
    }
  }, [dispatch]);

  return (
    <div
      className="w-[240px] min-w-[240px] h-full bg-ink flex flex-col"
      style={{ borderRight: '0.5px solid var(--color-stone)' }}
    >
      {/* New Session */}
      <button
        id="new-session-btn"
        onClick={() => {
          dispatch({ type: 'NEW_SESSION' });
          onNavigate?.();
        }}
        className="w-full font-mono text-xs uppercase tracking-[0.15em] text-ghost py-4 px-4 text-left transition-colors duration-150 hover:text-fog hover:bg-slate"
        style={{ borderBottom: '0.5px solid var(--color-stone)' }}
      >
        + NEW SESSION
      </button>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {state.sessions.length === 0 && (
          <p className="font-mono text-[10px] text-ghost uppercase tracking-[0.15em] px-4 pt-4 opacity-50">
            No sessions yet
          </p>
        )}
        {state.sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => {
              dispatch({ type: 'RESTORE_SESSION', session });
              onNavigate?.();
            }}
            className={`w-full text-left px-4 py-3 transition-colors duration-150 hover:bg-slate ${
              state.activeSession?.id === session.id ? 'bg-slate' : ''
            }`}
            style={{ borderBottom: '0.5px solid var(--color-stone)' }}
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-ghost">
              {session.modeName}
            </p>
            <p className="text-xs text-fog mt-1 truncate leading-tight">
              {session.input.slice(0, 40)}
            </p>
            <p className="font-mono text-[9px] text-ghost mt-1">
              {timeAgo(session.timestamp)}
            </p>
          </button>
        ))}
      </div>

      {/* User strip */}
      <div className="px-4 py-3" style={{ borderTop: '0.5px solid var(--color-stone)' }}>
        <p className="font-mono text-[10px] text-ghost uppercase tracking-[0.15em]">
          {state.username}
        </p>
        <button
          id="sign-out-btn"
          onClick={() => dispatch({ type: 'LOGOUT' })}
          className="font-mono text-[10px] text-ghost uppercase tracking-[0.15em] mt-1 hover:text-fog transition-colors duration-150"
        >
          SIGN OUT
        </button>
      </div>
    </div>
  );
}
