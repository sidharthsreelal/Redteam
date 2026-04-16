'use client';

import { memo, useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FrameworkStatus } from '@/lib/types';
import { StreamingBus } from '@/lib/streamingBus';
import { stripMarkdown } from '@/lib/stripMarkdown';
import ContinuationHandle from './ContinuationHandle';

interface SynthesisNodeData {
  status: FrameworkStatus;
  content: string;
  error?: string;
  startTime?: number;
  endTime?: number;
  selected?: boolean;
  onContinue?: () => void;
  busId?: string;          // allows per-continuation synthesis channels
  [key: string]: unknown;
}

const DEFAULT_ACCENT = '#3B82F6';

function SynthesisNodeComponent({ data, selected }: { data: SynthesisNodeData; selected?: boolean }) {
  const { status, content, error, startTime, endTime, onContinue } = data;
  const busId = (data.busId as string) || 'synthesis';

  const contentRef = useRef<HTMLParagraphElement>(null);
  const cursorRef  = useRef<HTMLSpanElement>(null);
  const isStreamingRef = useRef(false);

  useEffect(() => {
    if (status === 'streaming') {
      isStreamingRef.current = true;
      const unsub = StreamingBus.subscribe(busId, (text) => {
        if (!isStreamingRef.current) return;
        if (contentRef.current) {
          const clean = stripMarkdown(text);
          contentRef.current.textContent = clean.slice(0, 160);
        }
        if (cursorRef.current) cursorRef.current.style.display = 'inline-block';
      });
      return () => { isStreamingRef.current = false; unsub(); };
    }

    isStreamingRef.current = false;
    if (cursorRef.current) cursorRef.current.style.display = 'none';
    if (contentRef.current) contentRef.current.textContent = '';
  }, [busId, status]);

  const elapsed =
    status === 'complete' && startTime && endTime
      ? `${((endTime - startTime) / 1000).toFixed(1)}s`
      : null;

  const borderColor =
    status === 'error'
      ? '#EF4444'
      : status === 'streaming' || status === 'complete'
      ? DEFAULT_ACCENT
      : selected
      ? 'var(--color-ash)'
      : 'var(--color-stone)';

  return (
    <div
      className="w-[320px] p-4 rounded relative transition-all duration-300 cursor-pointer"
      style={{
        background: selected ? 'var(--color-slate)' : 'var(--color-ink)',
        border: `0.5px solid ${borderColor}`,
        opacity: status === 'idle' ? 0.4 : 1,
        boxShadow: status === 'streaming'
          ? `0 0 20px -4px ${DEFAULT_ACCENT}30`
          : selected
          ? `0 0 0 1px ${DEFAULT_ACCENT}30`
          : 'none',
      }}
    >
      {/* Status dot */}
      <div className="absolute top-3 right-3">
        {status === 'streaming' && <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: DEFAULT_ACCENT }} />}
        {status === 'complete'  && <div className="w-2 h-2 rounded-full" style={{ background: DEFAULT_ACCENT, opacity: 0.6 }} />}
      </div>

      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-fog mb-1 pr-4">
        SYNTHESIS
      </p>
      <p className="font-mono text-[12px] text-cloud pr-4">Strengthen Your Plan</p>

      <div className="mt-3 min-h-[36px]">
        {status === 'idle' && (
          <div className="flex gap-1.5 mt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full"
                style={{ background: DEFAULT_ACCENT, animation: `idle-pulse 1.6s ease-in-out ${i * 0.25}s infinite` }} />
            ))}
          </div>
        )}

        {(status === 'streaming' || status === 'complete') && (
          <div className="text-[11px] text-fog leading-relaxed">
            <p ref={contentRef} style={{ display: status === 'streaming' ? 'block' : 'none', margin: 0 }}>
              <span ref={cursorRef} className="cursor-blink align-middle"
                style={{ display: 'none', width: 2, height: 12, marginLeft: 2, background: DEFAULT_ACCENT }} />
            </p>
            {status === 'complete' && (
              <p style={{ margin: 0 }}>
                {(() => { const c = stripMarkdown(content || ''); return c.slice(0, 100) + (c.length > 100 ? '...' : ''); })()}
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
      <Handle type="source" position={Position.Right} id="right"
        style={{ background: '#14B8A6', width: 6, height: 6, border: 'none', opacity: 0 }} />

      {/* Continuation handle — appears only when complete */}
      {status === 'complete' && onContinue && (
        <ContinuationHandle onContinue={onContinue} />
      )}
    </div>
  );
}

export default memo(SynthesisNodeComponent);
