'use client';

import { useEffect, useRef, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { fuzzyMatch, type NodeReference } from '@/lib/references';

interface RefGroup {
  round: number;
  refs: NodeReference[];
}

interface ReferencePickerProps {
  refs: NodeReference[];
  query: string;               // text after the @ trigger
  anchorRect: DOMRect | null;
  onSelect: (ref: NodeReference) => void;
  onClose: () => void;
  chipCount: number;           // number of chips already inserted
}

const MAX_CHIPS = 5;

export default function ReferencePicker({
  refs,
  query,
  anchorRect,
  onSelect,
  onClose,
  chipCount,
}: ReferencePickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const activeIdxRef = useRef(0);

  // Filter refs by query
  const filtered = refs.filter((r) => fuzzyMatch(r.slug, query));

  // Group by round
  const groups: RefGroup[] = [];
  for (const ref of filtered) {
    let group = groups.find((g) => g.round === ref.round);
    if (!group) {
      group = { round: ref.round, refs: [] };
      groups.push(group);
    }
    group.refs.push(ref);
  }
  const flatFiltered = groups.flatMap((g) => g.refs);

  // Keyboard navigation (keydown forwarded from the contenteditable)
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdxRef.current = Math.min(activeIdxRef.current + 1, flatFiltered.length - 1);
        scrollActiveIntoView();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdxRef.current = Math.max(activeIdxRef.current - 1, 0);
        scrollActiveIntoView();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (flatFiltered.length > 0 && chipCount < MAX_CHIPS) {
          e.preventDefault();
          onSelect(flatFiltered[activeIdxRef.current] ?? flatFiltered[0]);
        }
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [flatFiltered, onSelect, onClose, chipCount]);

  function scrollActiveIntoView() {
    const el = pickerRef.current?.querySelector(`[data-idx="${activeIdxRef.current}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
    // Force re-render to highlight active row — we do it via a dataset attr + CSS
    pickerRef.current?.querySelectorAll('[data-idx]').forEach((node, i) => {
      (node as HTMLElement).style.background = i === activeIdxRef.current ? 'var(--color-slate)' : 'transparent';
    });
  }

  // Position picker above (or below) the anchor
  if (!anchorRect) return null;

  const PICKER_H = 240;
  const PICKER_W = 300;
  const MARGIN   = 8;

  const spaceAbove = anchorRect.top;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const showAbove  = spaceAbove >= PICKER_H + MARGIN || spaceAbove > spaceBelow;

  const top = showAbove
    ? anchorRect.top - PICKER_H - MARGIN
    : anchorRect.bottom + MARGIN;

  // Clamp horizontally
  const left = Math.min(
    Math.max(anchorRect.left, MARGIN),
    window.innerWidth - PICKER_W - MARGIN
  );

  const atMax = chipCount >= MAX_CHIPS;

  return createPortal(
    <div
      ref={pickerRef}
      className="fade-in"
      style={{
        position: 'fixed',
        top,
        left,
        width: PICKER_W,
        maxHeight: PICKER_H,
        zIndex: 99999,
        background: 'var(--color-ink)',
        border: '0.5px solid var(--color-stone)',
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {atMax ? (
        <div className="px-3 py-2">
          <span className="font-mono text-[10px]" style={{ color: '#F97316' }}>
            Maximum 5 references per message
          </span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-3 py-3">
          <span className="text-[12px] text-mist">No previous outputs to reference yet</span>
        </div>
      ) : (
        <div className="overflow-y-auto flex-1">
          {groups.map((group) => {
            let rowIdx = flatFiltered.indexOf(group.refs[0]);
            return (
              <div key={group.round}>
                {/* Group header */}
                <div
                  className="px-3 pt-2 pb-1"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-ghost)' }}
                >
                  {group.round === 0 ? 'Node 0 · Root' : `Node ${group.round}`}
                </div>

                {group.refs.map((ref, localIdx) => {
                  const idx = rowIdx + localIdx;
                  const preview = ref.content.slice(0, 60) + (ref.content.length > 60 ? '…' : '');
                  return (
                    <div
                      key={ref.slug}
                      data-idx={idx}
                      onMouseDown={(e) => { e.preventDefault(); onSelect(ref); }}
                      onMouseEnter={() => {
                        activeIdxRef.current = idx;
                        scrollActiveIntoView();
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '5px 12px',
                        cursor: 'pointer',
                        background: idx === 0 && groups[0].refs[0] === ref ? 'var(--color-slate)' : 'transparent',
                        borderLeft: '2px solid transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {/* Accent dot */}
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: ref.accent, flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-cloud)' }}>
                            {ref.frameworkName}
                          </span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-ghost)' }}>
                          {ref.slug}
                        </span>
                      </div>
                      {ref.content && (
                        <p style={{ margin: '2px 0 0 10px', fontSize: 10, color: 'var(--color-mist)', lineHeight: 1.3, fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {preview}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>,
    document.body
  );
}
