'use client';

import { memo, useState, useRef, useEffect, useSyncExternalStore, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useStore } from '@xyflow/react';
import { useTheme } from '@/lib/theme';
import CopyButton from './CopyButton';

interface InputNodeData {
  input: string;
  [key: string]: unknown;
}

const NODE_WIDTH  = 320;
const SIDEBAR_W   = 52;
const PANEL_W     = 390;
const TOPBAR_H    = 6;
const HOVER_MS    = 1000;

// Width used for tooltip sizing — matches the minimum node width
const tooltipW = (zoom: number) => Math.min(Math.max(Math.round(NODE_WIDTH * zoom), 200), 500);

function InputNodeComponent({
  data,
  selected,
  positionAbsoluteX,
  positionAbsoluteY,
}: {
  data: InputNodeData;
  selected?: boolean;
  positionAbsoluteX?: number;
  positionAbsoluteY?: number;
}) {
  const { theme } = useTheme();
  const preview =
    data.input?.length > 120 ? data.input.slice(0, 120) + '...' : (data.input || '');

  const [panX, panY, zoom] = useStore((s) => s.transform);
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mounted = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () => true,
    () => false
  );

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShowTooltip(true), HOVER_MS);
  };
  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowTooltip(false);
  };

  const rawScreenX  = (positionAbsoluteX ?? 0) * zoom + panX + (NODE_WIDTH * zoom) / 2;
  const screenY     = (positionAbsoluteY ?? 0) * zoom + panY;

  const tipW = tooltipW(zoom);

  const clampedLeft = Math.min(
    Math.max(rawScreenX - tipW / 2, SIDEBAR_W),
    window.innerWidth - PANEL_W - tipW
  );

  const tooltipBottom = Math.max(window.innerHeight - screenY + 8, TOPBAR_H);

  // First ~10 words, squashed to one line via CSS so the box stays a wide rectangle
  const previewText = (() => {
    const words = (data.input || '').trim().split(/\s+/);
    return words.slice(0, 10).join(' ') + (words.length > 10 ? '…' : '');
  })();

  const tooltip =
    mounted && showTooltip
      ? createPortal(
          <div
            className="fade-in"
            style={{
              position: 'fixed',
              bottom: tooltipBottom,
              left: clampedLeft,
              width: tipW,
              zIndex: 99900,
              pointerEvents: 'none',
              padding: '9px 12px',
              borderRadius: '5px',
              background: 'var(--color-ink)',
              border: '1px solid var(--color-signal)',
              boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
              // Keep it a single-line strip so it's always a wide rectangle
              overflow: 'hidden',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                color: 'var(--color-signal)',
                marginBottom: '4px',
                opacity: 0.7,
                whiteSpace: 'nowrap',
              }}
            >
              INPUT
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '12px',
                lineHeight: 1.4,
                color: 'var(--color-cloud)',
                // Single line — never wraps, always a horizontal strip
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {previewText}
            </p>
          </div>,
          document.body
        )
      : null;

  return (
    <div
      className="relative p-4 rounded transition-all duration-200 cursor-pointer group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        width: NODE_WIDTH,
        background: selected ? 'var(--color-slate)' : 'var(--color-ink)',
        border: selected
          ? `${theme === 'dark' ? '1px' : '1.5px'} solid var(--color-ash)`
          : `${theme === 'dark' ? '1px' : '1.5px'} solid var(--color-stone)`,
        boxShadow: selected ? '0 0 0 1px rgba(59,130,246,0.2)' : 'none',
      }}
    >
      {tooltip}
      <div className="absolute top-3 right-3">
        <CopyButton getText={() => `INPUT\n\n${data.input || ''}`} />
      </div>
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ghost mb-2">
        INPUT
      </p>
      <p className="text-[13px] text-fog leading-relaxed line-clamp-4 mt-2">
        {preview}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: 'var(--color-stone)', width: 6, height: 6, border: 'none' }}
      />
    </div>
  );
}

export default memo(InputNodeComponent);
