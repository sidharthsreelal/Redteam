'use client';

import { useState } from 'react';

interface ContinuationHandleProps {
  onContinue: () => void;
}

export default function ContinuationHandle({ onContinue }: ContinuationHandleProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="absolute" style={{ right: -10, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}>
      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute fade-in"
          style={{
            right: 28,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'var(--color-slate)',
            border: '0.5px solid var(--color-stone)',
            borderRadius: 4,
            padding: '3px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          <span className="font-mono text-[10px] text-ghost">Continue refining →</span>
        </div>
      )}

      {/* Handle circle */}
      <button
        onClick={onContinue}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: hovered ? '#14B8A6' : 'var(--color-slate)',
          border: '1px solid #14B8A6',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 150ms ease',
          color: hovered ? '#FFFFFF' : '#14B8A6',
          fontSize: 12,
          fontWeight: 400,
          lineHeight: 1,
          padding: 0,
        }}
        aria-label="Continue refining"
      >
        +
      </button>
    </div>
  );
}
