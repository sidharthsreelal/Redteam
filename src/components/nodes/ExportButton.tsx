'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { downloadNodeMarkdown } from '@/lib/markdownExport';

interface ExportButtonProps {
  // For the copy action (plain text)
  getText: () => string;
  // For the markdown download (title, label, markdown content)
  getMarkdown: () => { title: string; label: string; content: string };
}

/**
 * Drop-in replacement for CopyButton in the maximised detail panel header.
 * Shows a small "copy" icon by default. On click, opens a tiny dropdown:
 *   ① Copy to clipboard
 *   ② Download as Markdown
 */
export default function ExportButton({ getText, getMarkdown }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(getText());
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch { /* silent */ }
      setOpen(false);
    },
    [getText],
  );

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const { title, label, content } = getMarkdown();
      downloadNodeMarkdown(title, label, content);
      setOpen(false);
    },
    [getMarkdown],
  );

  return (
    <div ref={ref} className="relative" style={{ flexShrink: 0 }}>
      {/* Trigger button */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title="Copy / Export"
        className="flex items-center gap-0.5 transition-all duration-150 rounded"
        style={{
          padding: '3px 6px',
          background: open ? 'var(--color-slate)' : 'transparent',
          border: `0.5px solid ${open ? 'var(--color-ash)' : 'var(--color-stone)'}`,
          color: copied ? '#34D399' : 'var(--color-ghost)',
          cursor: 'pointer',
        }}
        aria-label="Export options"
      >
        {copied ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
        {/* Chevron */}
        <svg xmlns="http://www.w3.org/2000/svg" width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 1, opacity: 0.6 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 fade-in"
          style={{
            background: 'var(--color-ink)',
            border: '0.5px solid var(--color-ash)',
            borderRadius: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: 160,
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-ghost)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fog">
              Copy to clipboard
            </span>
          </button>

          <div style={{ height: '0.5px', background: 'var(--color-stone)' }} />

          <button
            onClick={handleDownload}
            className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-ghost)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fog">
              Download .md
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
