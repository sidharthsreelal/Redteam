'use client';

import { useState, useCallback } from 'react';

interface CopyButtonProps {
  getText: () => string;
}

/**
 * Tiny copy button — meant to sit inline next to the status dot.
 * Visibility is controlled by the parent node's `group` Tailwind class:
 *   opacity-0 → group-hover:opacity-100
 * so it only shows when the user hovers the entire node.
 */
export default function CopyButton({ getText }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(getText());
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch { /* clipboard denied — silent */ }
    },
    [getText],
  );

  return (
    <button
      onClick={handleClick}
      title="Copy node content"
      className="nodrag nopan opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      style={{
        width: 16,
        height: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        color: copied ? '#34D399' : 'var(--color-cloud)',
        cursor: 'pointer',
        transition: 'color 0.15s, opacity 0.15s',
        flexShrink: 0,
        padding: 0,
      }}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      )}
    </button>
  );
}
