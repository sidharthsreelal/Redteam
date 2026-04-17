'use client';

import { memo, useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FrameworkStatus } from '@/lib/types';
import { StreamingBus } from '@/lib/streamingBus';
import { stripMarkdown } from '@/lib/stripMarkdown';
import { getAccentOpacity } from '@/lib/edgeStyles';
import { useTheme } from '@/lib/theme';
import ContinuationHandle from './ContinuationHandle';
import CopyButton from './CopyButton';

interface FrameworkNodeData {
  frameworkId: string;
  label: string;
  title: string;
  accent: string;
  status: FrameworkStatus;
  content: string;
  error?: string;
  startTime?: number;
  endTime?: number;
  selected?: boolean;
  isChat?: boolean;
  onContinue?: () => void;
  [key: string]: unknown;
}

function FrameworkNodeComponent({ data, selected }: { data: FrameworkNodeData; selected?: boolean }) {
  const { frameworkId, label, title, accent, status, content, error, startTime, endTime, isChat, onContinue } = data;
  const { theme } = useTheme();

  const contentRef = useRef<HTMLParagraphElement>(null);
  const cursorRef  = useRef<HTMLSpanElement>(null);
  // isStreaming ref used to guard DOM writes after unmount
  const isStreamingRef = useRef(false);

  useEffect(() => {
    if (!frameworkId) return;

    if (status === 'streaming') {
      isStreamingRef.current = true;
      // Subscribe: write tokens directly to DOM — zero React renders
      const unsub = StreamingBus.subscribe(frameworkId, (text) => {
        if (!isStreamingRef.current) return;
        if (contentRef.current) {
          const clean = stripMarkdown(text);
          contentRef.current.textContent = clean.slice(0, 120);
        }
        if (cursorRef.current) cursorRef.current.style.display = 'inline-block';
      });
      return () => { isStreamingRef.current = false; unsub(); };
    }

    isStreamingRef.current = false;
    if (cursorRef.current) cursorRef.current.style.display = 'none';
    if (contentRef.current) contentRef.current.textContent = '';
  }, [frameworkId, status]);

  const elapsed =
    status === 'complete' && startTime && endTime
      ? `${((endTime - startTime) / 1000).toFixed(1)}s`
      : null;

  const borderColor =
    status === 'error'   ? '#EF4444'
    : status === 'streaming' || status === 'complete' ? accent   // always raw accent, full opacity
    : selected           ? 'var(--color-ash)'
    : 'var(--color-stone)';

  const glowColor = getAccentOpacity(accent, 'glow', theme);

  return (
    <div
      className="p-4 rounded relative transition-all duration-300 cursor-pointer group"
      style={{
        width: isChat ? 360 : 220,
        background: selected ? 'var(--color-slate)' : 'var(--color-ink)',
        borderTop:    `${theme === 'dark' ? '0.5px' : '1.5px'} solid ${borderColor}`,
        borderRight:  `${theme === 'dark' ? '0.5px' : '1.5px'} solid ${borderColor}`,
        borderBottom: `${theme === 'dark' ? '0.5px' : '1.5px'} solid ${borderColor}`,
        borderLeft:   `${status === 'streaming' ? (theme === 'dark' ? '2px' : '3px') : (theme === 'dark' ? '0.5px' : '1.5px')} solid ${borderColor}`,
        opacity:   status === 'idle' ? 0.5 : 1,
        boxShadow: status === 'streaming' ? `inset 3px 0 16px -4px ${glowColor}`
                 : selected             ? `0 0 0 1px ${getAccentOpacity(accent, 'glow', theme)}`
                 : 'none',
      }}
    >
      {/* Status dot + copy button — top-right flex row */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <CopyButton
          getText={() => {
            const parts = [label, title];
            if (status === 'complete' && content) parts.push(stripMarkdown(content));
            if (status === 'error' && error) parts.push(`ERROR: ${error}`);
            return parts.filter(Boolean).join('\n\n');
          }}
        />
        {status === 'streaming' && <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: accent }} />}
        {status === 'complete'  && <div className="w-2 h-2 rounded-full" style={{ background: accent, opacity: 0.7 }} />}
        {status === 'error'     && <div className="w-2 h-2 rounded-full" style={{ background: '#EF4444' }} />}
      </div>

      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-fog mb-1 pr-4">{label}</p>
      <p className="font-mono text-[12px] text-cloud pr-4">{title}</p>

      <div className="mt-3 min-h-[36px]">
        {status === 'idle' && (
          <div className="flex gap-1.5 mt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full"
                style={{ background: accent, animation: `idle-pulse 1.6s ease-in-out ${i * 0.25}s infinite` }} />
            ))}
          </div>
        )}

        {(status === 'streaming' || status === 'complete') && (
          <div className="text-[11px] text-fog leading-relaxed">
            {/* streaming layer — written directly by StreamingBus, hidden when complete */}
            <p style={{ display: status === 'streaming' ? 'block' : 'none', margin: 0 }}>
              <span ref={contentRef}></span>
              {/* cursor always uses raw accent colour */}
              <span ref={cursorRef} className="cursor-blink align-middle"
                style={{ display: 'none', width: 2, height: 12, marginLeft: 2, background: accent }} />
            </p>
            {/* complete layer — fully React-managed, shown when complete */}
            {status === 'complete' && (
              <p style={{ margin: 0 }}>
                {(() => { const c = stripMarkdown(content || ''); return c.slice(0, 80) + (c.length > 80 ? '...' : ''); })()}
              </p>
            )}
          </div>
        )}

        {status === 'complete' && elapsed && (
          <p className="font-mono text-[9px] text-fog mt-2">{elapsed}</p>
        )}

        {status === 'error' && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: '#EF4444' }}>ERROR</p>
            <p className="text-[11px] text-fog mt-1 line-clamp-2">{error}</p>
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Top}
        style={{ background: 'var(--color-stone)', width: 6, height: 6, border: 'none' }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: 'var(--color-stone)', width: 6, height: 6, border: 'none' }} />

      {/* Chat mode continuation handle */}
      {isChat && status === 'complete' && onContinue && (
        <ContinuationHandle onContinue={onContinue} />
      )}
    </div>
  );
}

export default memo(FrameworkNodeComponent);
