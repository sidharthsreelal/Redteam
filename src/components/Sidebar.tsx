'use client';

import { useApp } from '@/lib/store';
import { Session } from '@/lib/types';
import { useEffect, useState, useRef, useCallback } from 'react';

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

// ── Main Sidebar ─────────────────────────────────────────────────────────────
export default function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { state, dispatch } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('redteam-sessions');
      if (stored) {
        const sessions: Session[] = JSON.parse(stored);
        dispatch({ type: 'LOAD_SESSIONS', sessions });
      }
    } catch { /* silently fail */ }
  }, [dispatch]);

  const handleMouseEnter = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    setExpanded(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    collapseTimer.current = setTimeout(() => {
      setExpanded(false);
      setDeleteConfirm(null);
    }, 200);
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (deleteConfirm === sessionId) {
      dispatch({ type: 'DELETE_SESSION', sessionId });
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(sessionId);
    }
  }, [deleteConfirm, dispatch]);
  const handleTogglePin = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    dispatch({ type: 'TOGGLE_PIN', sessionId });
  }, [dispatch]);

  const sortedSessions = [...state.sessions].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.timestamp - a.timestamp;
  });

  // Filter by search query (case-insensitive, matches input or mode name)
  const filteredSessions = searchQuery.trim()
    ? sortedSessions.filter((s) => {
        const q = searchQuery.toLowerCase();
        return s.input.toLowerCase().includes(q) || s.modeName.toLowerCase().includes(q);
      })
    : sortedSessions;

  return (
    <div
      ref={sidebarRef}
      className="h-full flex-shrink-0 relative"
      style={{ zIndex: 30 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── Collapsed rail (always visible) ── */}
      <div
        className="h-full flex flex-col items-center py-3 gap-4 absolute left-0 top-0"
        style={{
          width: 48,
          borderRight: '0.5px solid var(--color-stone)',
          background: 'var(--color-ink)',
        }}
      >
        {/* New session icon */}
        <button
          onClick={() => { dispatch({ type: 'NEW_SESSION' }); onNavigate?.(); }}
          className="w-8 h-8 flex items-center justify-center text-ghost hover:text-fog transition-colors rounded"
          title="New session"
          aria-label="New session"
        >
          <span className="font-mono text-[16px] font-light leading-none">+</span>
        </button>

        <div className="flex-1" />
      </div>

      {/* ── Expanded panel (hovers over content) ── */}
      <div
        className="absolute left-0 top-0 h-full flex flex-col"
        style={{
          width: expanded ? 240 : 48,
          overflow: 'hidden',
          borderRight: '0.5px solid var(--color-stone)',
          background: 'var(--color-ink)',
          transition: 'width 200ms cubic-bezier(0.4,0,0.2,1)',
          boxShadow: expanded ? '4px 0 24px rgba(0,0,0,0.3)' : 'none',
        }}
      >
        {/* Header */}
        <div
          className="flex flex-col flex-shrink-0"
          style={{ borderBottom: '0.5px solid var(--color-stone)', minHeight: 49 }}
        >
          {/* + New session — show text when expanded */}
          <div
            className="flex items-center gap-3 px-3 py-[14px]"
          >
            <button
              onClick={() => { dispatch({ type: 'NEW_SESSION' }); onNavigate?.(); setExpanded(false); setSearchQuery(''); }}
              className="flex items-center gap-3 text-ghost hover:text-fog transition-colors w-full text-left"
              id="new-session-btn"
            >
              <span className="font-mono text-[16px] font-light leading-none flex-shrink-0 w-6 text-center">+</span>
              {expanded && (
                <span className="font-mono text-xs uppercase tracking-[0.15em] whitespace-nowrap overflow-hidden">
                  NEW SESSION
                </span>
              )}
            </button>
          </div>

          {/* Search input — only when expanded */}
          {expanded && (
            <div className="px-3 pb-2">
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded transition-all duration-150"
                style={{
                  background: 'var(--color-void)',
                  border: searchFocused ? '0.5px solid var(--color-fog)' : '0.5px solid var(--color-stone)',
                  boxShadow: searchFocused ? '0 0 0 1px rgba(255,255,255,0.05)' : 'none',
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-ghost)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Search sessions…"
                  className="flex-1 bg-transparent outline-none text-ghost placeholder:text-ghost"
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    color: 'var(--color-fog)',
                    border: 'none',
                    padding: 0,
                    width: '100%',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-ghost)', lineHeight: 1, fontSize: 11, opacity: 0.6 }}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              {searchQuery && (
                <p className="font-mono text-[8px] text-ghost mt-1 px-1 opacity-50">
                  {filteredSessions.length} of {sortedSessions.length}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {state.sessions.length === 0 && expanded && (
            <p className="font-mono text-[10px] text-ghost uppercase tracking-[0.15em] px-4 pt-4 opacity-50 whitespace-nowrap">
              No sessions yet
            </p>
          )}
          {filteredSessions.length === 0 && searchQuery && expanded && (
            <p className="font-mono text-[10px] text-ghost uppercase tracking-[0.15em] px-4 pt-4 opacity-40 whitespace-nowrap">
              No results
            </p>
          )}
          {filteredSessions.map((session) => (

            <div
              key={session.id}
              className={`relative flex items-stretch transition-colors duration-150 hover:bg-slate ${
                state.activeSession?.id === session.id ? 'bg-slate' : ''
              }`}
              style={{ borderBottom: '0.5px solid var(--color-stone)' }}
            >
              <div
                onClick={() => { dispatch({ type: 'RESTORE_SESSION', session }); onNavigate?.(); setExpanded(false); }}
                className="flex-1 text-left px-3 py-3 overflow-hidden h-[72px] flex flex-col justify-center cursor-pointer"
              >
                {expanded ? (
                  <>
                    <div className="flex items-center gap-1.5 h-4">
                      <button
                        onClick={(e) => handleTogglePin(e, session.id)}
                        className={`transition-colors flex-shrink-0 flex items-center justify-center p-0 ${
                          session.isPinned ? 'text-amber-400' : 'text-ghost opacity-40 hover:opacity-100'
                        }`}
                        title={session.isPinned ? 'Unpin session' : 'Pin session'}
                        style={{ fontSize: 11, width: 14, height: 14 }}
                      >
                        {session.isPinned ? '★' : '☆'}
                      </button>
                      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-ghost whitespace-nowrap overflow-hidden text-ellipsis">
                        {session.modeName}
                      </p>
                    </div>
                    <p className="text-xs text-fog mt-0.5 truncate leading-tight">
                      {session.input.slice(0, 38)}
                    </p>
                    <p className="font-mono text-[9px] text-ghost mt-0.5">{timeAgo(session.timestamp)}</p>
                  </>
                ) : (
                  /* Collapsed: dot — accent color if this is the active chat */
                  (() => {
                    const isActive = session.id === state.activeSession?.id;
                    if (session.isPinned) {
                      return (
                        <span 
                          className="mx-auto text-amber-400" 
                          style={{ 
                            fontSize: 12, 
                            opacity: isActive ? 1 : 0.6,
                            filter: isActive ? 'drop-shadow(0 0 4px rgba(251,191,36,0.6))' : 'none'
                          }}
                        >
                          ★
                        </span>
                      );
                    }
                    return (
                      <div
                        className="w-2 h-2 rounded-full mx-auto"
                        style={{
                          background: isActive ? 'var(--color-signal)' : 'var(--color-ash)',
                          opacity: isActive ? 1 : 0.4,
                          boxShadow: isActive ? '0 0 6px var(--color-signal)' : 'none',
                        }}
                      />
                    );
                  })()
                )}
              </div>

              {/* Delete button — only when expanded */}
              {expanded && (
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  className="flex-shrink-0 flex items-center px-2 text-ghost hover:text-red-400 transition-colors"
                  title={deleteConfirm === session.id ? 'Click again to confirm' : 'Delete session'}
                  aria-label="Delete session"
                >
                  {deleteConfirm === session.id ? (
                    <span className="font-mono text-[9px] text-red-400 uppercase whitespace-nowrap">DEL?</span>
                  ) : (
                    <span className="text-[12px] leading-none opacity-40 hover:opacity-100">✕</span>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Spacer to push main content right of the collapsed rail */}
      <div style={{ width: 48 }} />
    </div>
  );
}
