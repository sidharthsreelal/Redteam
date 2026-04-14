'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FrameworkStatus } from '@/lib/types';
import { stripMarkdown } from '@/lib/stripMarkdown';

interface SynthesisNodeData {
  status: FrameworkStatus;
  content: string;
  error?: string;
  startTime?: number;
  endTime?: number;
  [key: string]: unknown;
}

const accent = '#3B82F6';

function SynthesisNodeComponent({ data, selected }: { data: SynthesisNodeData; selected?: boolean }) {
  const { status, content, error, startTime, endTime } = data;
  const clean = stripMarkdown(content || '');
  const preview = clean.length > 100 ? clean.slice(0, 100) + '...' : clean;

  const elapsed =
    status === 'complete' && startTime && endTime
      ? `${((endTime - startTime) / 1000).toFixed(1)}s`
      : null;

  const borderColor =
    status === 'error'
      ? '#EF4444'
      : status === 'streaming' || status === 'complete'
      ? accent
      : selected
      ? 'var(--color-ash)'
      : 'var(--color-stone)';

  return (
    <div
      className="w-[320px] p-4 rounded relative transition-all duration-300 cursor-pointer"
      style={{
        background: selected ? '#131620' : 'var(--color-ink)',
        border: `0.5px solid ${borderColor}`,
        opacity: status === 'idle' ? 0.4 : 1,
        boxShadow: status === 'streaming'
          ? `0 0 20px -4px ${accent}30`
          : selected
          ? `0 0 0 1px ${accent}30`
          : 'none',
      }}
    >
      {/* Status dot */}
      <div className="absolute top-3 right-3">
        {status === 'streaming' && (
          <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: accent }} />
        )}
        {status === 'complete' && (
          <div className="w-2 h-2 rounded-full" style={{ background: accent, opacity: 0.6 }} />
        )}
      </div>

      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-ghost mb-1 pr-4">
        SYNTHESIS
      </p>
      <p className="font-mono text-[12px] text-cloud pr-4">Strengthen Your Plan</p>

      <div className="mt-3 min-h-[36px]">
        {status === 'idle' && (
          <div className="flex gap-1.5 mt-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: accent,
                  animation: `idle-pulse 1.6s ease-in-out ${i * 0.25}s infinite`,
                }}
              />
            ))}
          </div>
        )}
        {status === 'streaming' && (
          <p className="text-[11px] text-fog leading-relaxed">
            {preview}
            <span
              className="inline-block w-0.5 h-3 ml-0.5 cursor-blink align-middle"
              style={{ background: accent }}
            />
          </p>
        )}
        {status === 'complete' && (
          <>
            <p className="text-[11px] text-fog leading-relaxed line-clamp-4">{preview}</p>
            {elapsed && (
              <p className="font-mono text-[9px] text-ghost mt-2">{elapsed}</p>
            )}
          </>
        )}
        {status === 'error' && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: '#EF4444' }}>
              ERROR
            </p>
            <p className="text-[11px] text-fog mt-1 line-clamp-2">{error}</p>
          </div>
        )}
      </div>

      <Handle
        type="target"
        position={Position.Top}
        style={{ background: 'var(--color-stone)', width: 6, height: 6, border: 'none' }}
      />
    </div>
  );
}

export default memo(SynthesisNodeComponent);
