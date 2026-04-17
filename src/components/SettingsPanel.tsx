'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/lib/store';
import { useTheme } from '@/lib/theme';

const USER_MEMORY_KEY = 'redteam_user_memory';
const USER_MEMORY_MAX = 1200;

export default function SettingsPanel() {
  const { state, dispatch } = useApp();
  const { theme, toggle } = useTheme();
  
  const [open, setOpen] = useState(false);
  const [memory, setMemory] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [showMore, setShowMore] = useState(false);
  
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load user memory
  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_MEMORY_KEY) || '';
      setMemory(stored);
    } catch { /* silent */ }
  }, []);

  // Close panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (open && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleEdit = useCallback(() => {
    setDraft(memory);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [memory]);

  const handleSave = useCallback(() => {
    const trimmed = draft.slice(0, USER_MEMORY_MAX);
    setMemory(trimmed);
    setEditing(false);
    try {
      localStorage.setItem(USER_MEMORY_KEY, trimmed);
    } catch { /* silent */ }
  }, [draft]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setDraft(memory);
  }, [memory]);

  const lines = memory.split('\n');
  const displayLines = showMore ? lines : lines.slice(0, 5);
  const hasMore = lines.length > 5;

  return (
    <div className="relative" ref={panelRef}>
      {/* Admin Name & Settings Button Container */}
      <div className="flex items-center gap-3">
        {/* Admin Name */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-slate border border-stone flex items-center justify-center">
             <span className="font-mono text-[8px] text-ghost uppercase">
               {state.username?.[0] || 'A'}
             </span>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-fog hidden sm:block">
            {state.username || 'ADMIN'}
          </span>
        </div>

        {/* Global Settings Trigger */}
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center justify-center p-1.5 rounded transition-colors hover:bg-slate text-ghost hover:text-fog"
          title="Settings & Identity"
          aria-label="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Settings Dropdown */}
      {open && (
        <div 
          className="absolute right-0 top-9 w-72 bg-ink border border-stone rounded flex flex-col z-[100] fade-in"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        >
          {/* Section: User Memory */}
          <div className="p-4 flex flex-col gap-3 border-b border-stone">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ghost">User Memory</span>
              {!editing ? (
                <button 
                  onClick={handleEdit}
                  className="text-[10px] text-ghost hover:text-fog transition-colors"
                >
                  ✎ Edit
                </button>
              ) : (
                <button 
                  onClick={handleSave}
                  className="font-mono text-[9px] uppercase tracking-wider text-signal"
                >
                  Save
                </button>
              )}
            </div>
            
            {editing ? (
              <div className="flex flex-col gap-1">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, USER_MEMORY_MAX))}
                  className="w-full bg-void border border-stone rounded p-2 text-[11px] text-cloud outline-none focus:border-signal resize-none leading-relaxed"
                  style={{ minHeight: 120 }}
                />
                <div className="flex justify-between items-center">
                  <button onClick={handleCancel} className="text-[9px] text-ghost hover:text-red-400">Cancel</button>
                  <span className="font-mono text-[9px] text-ghost opacity-60">
                    {draft.length} / {USER_MEMORY_MAX}
                  </span>
                </div>
              </div>
            ) : memory ? (
              <div className="flex flex-col gap-1">
                <p className="text-[11px] text-fog leading-relaxed italic opacity-90">
                  {displayLines.join('\n')}
                </p>
                {hasMore && (
                  <button 
                    onClick={() => setShowMore(!showMore)}
                    className="text-[9px] text-ghost hover:underline self-start"
                  >
                    {showMore ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            ) : (
              <p 
                className="text-[10px] text-ghost italic cursor-pointer hover:text-fog" 
                onClick={handleEdit}
              >
                Add instructions or context about your project to improve AI relevance across sessions.
              </p>
            )}
          </div>

          {/* Section: App Settings */}
          <div className="p-1 px-3 py-2 flex flex-col border-b border-stone">
             <button
                onClick={toggle}
                className="flex items-center justify-between px-2 py-2 text-ghost hover:text-fog hover:bg-slate rounded transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px]">{theme === 'dark' ? '○' : '☽'}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider">Theme</span>
                </div>
                <span className="font-mono text-[9px] opacity-60 group-hover:opacity-100">
                  {theme === 'dark' ? 'DARK' : 'LIGHT'}
                </span>
              </button>
          </div>

          {/* Section: Account */}
          <div className="p-2">
            <button
               onClick={() => dispatch({ type: 'LOGOUT' })}
               className="w-full flex items-center gap-2 px-3 py-2 text-ghost hover:text-red-400 hover:bg-slate rounded transition-colors group"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="font-mono text-[10px] uppercase tracking-wider">Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
