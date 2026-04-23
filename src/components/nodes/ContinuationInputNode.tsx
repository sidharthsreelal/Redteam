'use client';

import { memo, useState, useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useStore } from '@xyflow/react';
import { MODES } from '@/lib/modes';
import type { Mode, Session } from '@/lib/types';
import { collectReferences, buildReferencesBlock, type NodeReference } from '@/lib/references';
import { useApp } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import ReferencePicker from '@/components/ReferencePicker';
import CopyButton from './CopyButton';
import { downloadMarkdown } from '@/lib/markdownExport';

// ── Framework accent map (frameworkId → accent hex) ───────────────────────────
// Used to colour chips and picker dots. We derive this from MODES at startup.
const ACCENT_MAP: Record<string, string> = {};
for (const mode of MODES) {
  for (const fw of mode.frameworks) {
    ACCENT_MAP[fw.id] = fw.accent;
  }
}

interface ContinuationInputNodeData {
  continuationIndex: number;
  defaultMode: Mode;
  onSubmit: (input: string, mode: Mode, references: NodeReference[], webSearchEnabled: boolean) => void;
  onDelete?: () => void;
  hasChildren?: boolean;
  frozen?: boolean;
  frozenInput?: string;
  frozenModeName?: string;
  [key: string]: unknown;
}

const NODE_WIDTH  = 320;
const SIDEBAR_W   = 52;
const PANEL_W     = 390;
const TOPBAR_H    = 6;
const HOVER_MS    = 1000;
const MAX_CHIPS   = 5;

const tooltipW = (zoom: number) => Math.min(Math.max(Math.round(NODE_WIDTH * zoom), 200), 420);

// ── Chip data stored as a Map keyed by a unique DOM id ────────────────────────
interface ChipData {
  ref: NodeReference;
}

// ── Chip span element factory ─────────────────────────────────────────────────
function createChipSpan(ref: NodeReference, chipId: string): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.setAttribute('data-chip-id', chipId);
  chip.setAttribute('data-slug', ref.slug);
  chip.contentEditable = 'false';
  chip.style.cssText = [
    `background: ${ref.accent}20`,
    `border: 0.5px solid ${ref.accent}`,
    `border-radius: 4px`,
    `padding: 2px 6px`,
    `margin: 0 2px`,
    `font-family: var(--font-geist-mono, monospace)`,
    `font-size: 10px`,
    `color: ${ref.accent}`,
    `display: inline-flex`,
    `align-items: center`,
    `gap: 3px`,
    `cursor: default`,
    `user-select: none`,
    `vertical-align: baseline`,
  ].join(';');

  // Slug text
  const label = document.createTextNode(ref.slug);
  chip.appendChild(label);

  // × button
  const x = document.createElement('span');
  x.textContent = '×';
  x.setAttribute('data-chip-remove', chipId);
  x.style.cssText = `font-size: 8px; color: var(--color-ghost); cursor: pointer; margin-left: 2px;`;
  chip.appendChild(x);

  return chip;
}

// ── Main component ─────────────────────────────────────────────────────────────
function ContinuationInputNodeComponent({
  data,
  positionAbsoluteX,
  positionAbsoluteY,
}: {
  data: ContinuationInputNodeData;
  positionAbsoluteX?: number;
  positionAbsoluteY?: number;
}) {
  const {
    continuationIndex, defaultMode, onSubmit, onDelete,
    hasChildren, frozen, frozenInput, frozenModeName,
  } = data;

  const { state, cancelContinuation, isExecuting } = useApp();
  const activeSession = state.activeSession;
  const { theme } = useTheme();

  const [selectedMode, setSelectedMode] = useState<Mode>(defaultMode);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── contenteditable ref ──────────────────────────────────────────────────────
  const editableRef = useRef<HTMLDivElement>(null);
  const chipsRef    = useRef<Map<string, ChipData>>(new Map());
  const chipCounterRef = useRef(0);

  // ── @-picker state ────────────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  const [chipCount, setChipCount] = useState(0);
  const [textLen, setTextLen] = useState(0);
  const atTriggerPosRef = useRef<{ node: Node; offset: number } | null>(null);

  const mounted = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () => true,
    () => false
  );

  // Available references from the current session
  const availableRefs = activeSession
    ? collectReferences(activeSession, ACCENT_MAP)
    : [];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // Focus on mount
  useEffect(() => {
    if (!frozen && editableRef.current) {
      // Small delay to ensure React Flow has finished positioning
      const timer = setTimeout(() => {
        editableRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [frozen]);

  // ── Extract plain text + chips from contenteditable ──────────────────────────
  const getContent = useCallback((): { text: string; chips: NodeReference[] } => {
    const el = editableRef.current;
    if (!el) return { text: '', chips: [] };

    let text = '';
    const chips: NodeReference[] = [];

    const walk = (node: ChildNode) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent ?? '';
      } else if (node instanceof HTMLElement) {
        const chipId = node.getAttribute('data-chip-id');
        if (chipId) {
          const slug = node.getAttribute('data-slug') ?? '';
          text += slug;      // replace chip with its slug in the text
          const data = chipsRef.current.get(chipId);
          if (data) chips.push(data.ref);
        } else {
          node.childNodes.forEach(walk);
        }
      }
    };
    el.childNodes.forEach(walk);

    return { text: text.trim(), chips };
  }, []);

  const getTextLength = useCallback(() => {
    return getContent().text.length;
  }, [getContent]);
  // Unused — kept for reference; actual length tracked via textLen state

  // ── Insert a chip at the @ trigger position ──────────────────────────────────
  const insertChip = useCallback((ref: NodeReference) => {
    if (!editableRef.current || !atTriggerPosRef.current) return;
    if (chipsRef.current.size >= MAX_CHIPS) return;

    const sel = window.getSelection();
    if (!sel) return;

    // Find and delete the @{query} text from the trigger position to cursor
    const { node: triggerNode, offset: triggerOffset } = atTriggerPosRef.current;

    // Delete from triggerOffset to current cursor in the same text node
    let cursorOffset = sel.focusOffset;
    if (sel.focusNode === triggerNode) {
      cursorOffset = sel.focusOffset;
    }

    // Remove the @ and any typed query from the text node
    if (triggerNode.nodeType === Node.TEXT_NODE && triggerNode.parentNode) {
      const text = triggerNode.textContent ?? '';
      const before = text.slice(0, triggerOffset);
      const after  = text.slice(cursorOffset);
      triggerNode.textContent = before + after;

      // Move cursor to after the trimmed position
      sel.collapse(triggerNode, before.length);
    }

    // Create and insert chip
    const chipId = `chip-${++chipCounterRef.current}`;
    chipsRef.current.set(chipId, { ref });

    const chipEl = createChipSpan(ref, chipId);

    // Insert at cursor position
    const range = sel.getRangeAt(0);
    range.insertNode(chipEl);

    // Move cursor after the chip — insert a zero-width space after chip
    const spacer = document.createTextNode('\u200B');
    chipEl.after(spacer);
    sel.collapse(spacer, 1);

    setChipCount(chipsRef.current.size);
    setPickerOpen(false);
    atTriggerPosRef.current = null;
    editableRef.current.focus();
  }, []);

  // ── Remove chip on × click ───────────────────────────────────────────────────
  const handleEditableClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const chipId = target.getAttribute('data-chip-remove');
    if (chipId) {
      chipsRef.current.delete(chipId);
      setChipCount(chipsRef.current.size);
      const chipEl = editableRef.current?.querySelector(`[data-chip-id="${chipId}"]`);
      chipEl?.remove();
    }
  }, []);

  // ── Handle contenteditable input / keydown ───────────────────────────────────
  const handleInput = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node  = range.startContainer;
    const offset = range.startOffset;

    if (node.nodeType !== Node.TEXT_NODE) {
      setPickerOpen(false);
      return;
    }

    const text = node.textContent ?? '';
    // Walk back to find the last @ before the cursor
    let atPos = -1;
    for (let i = offset - 1; i >= 0; i--) {
      if (text[i] === '@') { atPos = i; break; }
      if (text[i] === ' ' || text[i] === '\n') break;
    }

    if (atPos !== -1) {
      const query = text.slice(atPos + 1, offset);
      atTriggerPosRef.current = { node, offset: atPos };
      setPickerQuery(query);

      // Position picker relative to textarea bounding rect
      const rect = editableRef.current?.getBoundingClientRect() ?? null;
      setPickerAnchor(rect);
      setPickerOpen(true);
    } else {
      setPickerOpen(false);
      atTriggerPosRef.current = null;
    }

    // Update character count for EXECUTE button enable/disable
    setTextLen(getContent().text.length);
  }, [getContent]);

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (frozen) return;
    const { text, chips } = getContent();
    if (text.length < 10) return;
    onSubmit(text, selectedMode, chips, webSearchEnabled);
  }, [frozen, getContent, onSubmit, selectedMode, webSearchEnabled]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (pickerOpen && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape')) {
      // Let ReferencePicker's own document listener handle these
      return;
    }

    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter -> just insert newline (let default behavior happen)
        return;
      }
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Backspace over a chip: delete the chip
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        
        // Only consider deleting the chip if the cursor is at the very beginning of its text node
        // (or right after the 0-width spacer if no other text has been typed)
        const isAtBoundary = range.collapsed && 
          (range.startOffset === 0 || (range.startOffset === 1 && range.startContainer.textContent === '\u200B'));

        if (isAtBoundary) {
          const prev = range.startContainer.previousSibling ?? (range.startContainer.parentNode?.previousSibling);
          if (prev instanceof HTMLElement && prev.hasAttribute('data-chip-id')) {
            e.preventDefault();
            const chipId = prev.getAttribute('data-chip-id')!;
            chipsRef.current.delete(chipId);
            setChipCount(chipsRef.current.size);
            prev.remove();
          }
        }
      }
    }
  }, [handleSubmit, pickerOpen]);

  // ── Delete button ────────────────────────────────────────────────────────────
  const handleDeleteClick = () => {
    if (hasChildren) {
      setConfirmDelete(true);
    } else {
      onDelete?.();
    }
  };

  const DeleteButton = () => (
    onDelete ? (
      <button
        onClick={(e) => { e.stopPropagation(); handleDeleteClick(); }}
        title="Delete this branch"
        className="absolute top-2 right-2 opacity-40 hover:opacity-100 transition-opacity"
        style={{
          color: '#EF4444',
          fontSize: 14,
          lineHeight: 1,
          padding: '2px 4px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        ✕
      </button>
    ) : null
  );

  const WarningOverlay = () => (
    <div
      className="absolute inset-x-[-1px] inset-y-[-1px] rounded z-50 flex flex-col items-center justify-center p-4 text-center"
      style={{
        background: 'rgba(8, 10, 15, 0.98)',
        border: '1px solid #EF4444',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 0 20px rgba(239, 68, 68, 0.15)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[#EF4444] text-[14px]">⚠</span>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] font-bold" style={{ color: '#EF4444' }}>
          BRANCH HAS CHILDREN
        </p>
      </div>
      <p className="text-[11px] leading-snug mb-4 max-w-[220px]" style={{ color: '#D1D5DB' }}>
        Deleting this will remove all secondary and tertiary nodes connected here.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => { setConfirmDelete(false); onDelete?.(); }}
          className="font-mono text-[9px] uppercase tracking-wider px-3 py-1.5 transition-all"
          style={{ border: '0.5px solid #EF4444', color: '#EF4444', background: 'transparent', borderRadius: 2 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#EF4444'; e.currentTarget.style.color = '#000'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#EF4444'; }}
        >
          DELETE ALL
        </button>
        <button
          onClick={() => setConfirmDelete(false)}
          className="font-mono text-[9px] uppercase tracking-wider px-3 py-1.5 transition-all"
          style={{ border: '0.5px solid var(--color-stone)', color: 'var(--color-ghost)', background: 'transparent', borderRadius: 2 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          CANCEL
        </button>
      </div>
    </div>
  );

  // ── Tooltip (frozen state hover) ──────────────────────────────────────────────
  const [panX, panY, zoom] = useStore((s) => s.transform);
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (!frozen) return;
    timeoutRef.current = setTimeout(() => setShowTooltip(true), HOVER_MS);
  };
  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowTooltip(false);
  };

  const rawScreenX = (positionAbsoluteX ?? 0) * zoom + panX + (NODE_WIDTH * zoom) / 2;
  const screenY    = (positionAbsoluteY ?? 0) * zoom + panY;
  const tipW = tooltipW(zoom);

  const clampedLeft = Math.min(
    Math.max(rawScreenX - tipW / 2, SIDEBAR_W),
    window.innerWidth - PANEL_W - tipW
  );
  const tooltipBottom = Math.max(window.innerHeight - screenY + 8, TOPBAR_H);

  const rawContent = frozen ? (frozenInput || '') : '';
  const words = rawContent.trim().split(/\s+/);
  const contentToDisplay = words.slice(0, 10).join(' ') + (words.length > 10 ? '…' : '');

  const Tooltip = () => mounted && showTooltip && contentToDisplay.length > 0 ? createPortal(
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
        overflow: 'hidden',
      }}
    >
      <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-signal)', marginBottom: '4px', opacity: 0.7, whiteSpace: 'nowrap' }}>
        INPUT
      </p>
      <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.4, color: 'var(--color-cloud)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {contentToDisplay}
      </p>
    </div>,
    document.body
  ) : null;

  // ── Frozen view ──────────────────────────────────────────────────────────────
  if (frozen) {
    return (
      <div
        className="relative w-[320px] p-4 rounded group"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ background: 'var(--color-ink)', border: `${theme === 'dark' ? '0.5px' : '1.5px'} solid var(--color-stone)`, minHeight: 140 }}
      >
        <Tooltip />
        <div className="absolute top-3 right-3">
          <CopyButton
            getText={() => [
              `NODE ${continuationIndex}`,
              frozenModeName || '',
              frozenInput || '',
            ].filter(Boolean).join('\n\n')}
          />
        </div>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-ghost mb-2">
          NODE {continuationIndex}
        </p>
        <p className="font-mono text-[10px] text-ghost mb-1">{frozenModeName}</p>
        <p className="text-[12px] text-fog">
          {(frozenInput || '').slice(0, 60)}{(frozenInput || '').length > 60 ? '…' : ''}
        </p>
        <DeleteButton />
        {confirmDelete && <WarningOverlay />}
        <Handle type="target" position={Position.Left}
          style={{ background: 'var(--color-stone)', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Bottom}
          style={{ background: 'var(--color-stone)', width: 6, height: 6, border: 'none' }} />
      </div>
    );
  }

  // ── Interactive view ─────────────────────────────────────────────────────────

  return (
    <div
      className="nodrag nopan relative w-[320px] p-4 rounded"
      style={{ background: 'var(--color-ink)', border: `${theme === 'dark' ? '0.5px' : '1.5px'} solid var(--color-stone)`, minHeight: 160 }}
    >
      {confirmDelete && <WarningOverlay />}

      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-ghost mb-3">
        NODE {continuationIndex}
      </p>

      {/* @ hint */}
      <p className="font-mono text-[8px] text-ghost mb-2 opacity-60">
        Type <span style={{ color: 'var(--color-signal)' }}>@</span> to reference a previous node · e.g. <span style={{ color: 'var(--color-signal)' }}>@n0-synthesis</span>
      </p>

      {/* Mode dropdown */}
      <div className="relative mb-3" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-left"
          style={{ background: 'var(--color-void)', border: `${theme === 'dark' ? '0.5px' : '1.5px'} solid var(--color-stone)`, borderRadius: 2, cursor: 'pointer' }}
        >
          <span className="font-mono text-[11px] text-cloud">{selectedMode.name}</span>
          <span className="font-mono text-[10px] text-ghost ml-2">▾</span>
        </button>

        {dropdownOpen && (
          <div
            className="absolute top-full left-0 right-0 z-50 fade-in"
            style={{ background: 'var(--color-ink)', border: `${theme === 'dark' ? '0.5px' : '1.5px'} solid var(--color-stone)`, marginTop: 2, borderRadius: 2 }}
          >
            {MODES.map((mode) => {
              const isSelectedMode = mode.id === selectedMode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => { setSelectedMode(mode); setDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 transition-colors flex items-center justify-between group"
                  style={{ 
                    borderLeft: isSelectedMode ? `0.5px solid ${mode.accent || 'var(--color-signal)'}` : '0.5px solid transparent',
                    background: isSelectedMode ? `linear-gradient(90deg, color-mix(in srgb, ${mode.accent} 10%, transparent), transparent)` : 'transparent' 
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `linear-gradient(90deg, color-mix(in srgb, ${mode.accent} 10%, transparent), transparent)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isSelectedMode ? `linear-gradient(90deg, color-mix(in srgb, ${mode.accent} 10%, transparent), transparent)` : 'transparent';
                  }}
                >
                  <div>
                    <p className="font-mono text-[12px]" style={{ color: isSelectedMode ? mode.accent : 'var(--color-cloud)' }}>{mode.name}</p>
                    <p className="text-[10px] text-mist mt-0.5">{mode.tagline}</p>
                  </div>
                  <span
                    className="flex-shrink-0 ml-3"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: mode.accent,
                      opacity: isSelectedMode ? 1 : 0.4,
                      transition: 'opacity 150ms ease',
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* contenteditable textarea replacement */}
      <div
        ref={editableRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleEditableClick}
        data-placeholder="Refine, challenge, or redirect the synthesis..."
        className="nodrag nopan w-full outline-none text-[13px] text-cloud leading-relaxed"
        style={{
          background: 'var(--color-void)',
          border: `0.5px solid ${selectedMode.accent}44`,
          minHeight: 80,
          maxHeight: 160,
          padding: '8px 12px',
          overflowY: 'auto',
          borderRadius: 2,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.6,
          cursor: 'text',
          outline: 'none',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = selectedMode.accent;
          e.currentTarget.style.boxShadow = `0 0 18px 4px ${selectedMode.accent}22`;
          e.currentTarget.style.outline = 'none';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = `${selectedMode.accent}44`;
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.outline = 'none';
          // Close picker when losing focus (unless clicking within picker)
          setTimeout(() => setPickerOpen(false), 150);
        }}
      />

      {/* Picker */}
      {mounted && pickerOpen && (
        <ReferencePicker
          refs={availableRefs}
          query={pickerQuery}
          anchorRect={pickerAnchor}
          onSelect={insertChip}
          onClose={() => setPickerOpen(false)}
          chipCount={chipCount}
        />
      )}

      {/* Submit row */}
      <div className="flex items-center justify-between mt-2 gap-2">
        <span className="font-mono text-[9px] text-ghost">{textLen} / 2000</span>
        {/* Web search toggle */}
        <button
          type="button"
          onClick={() => setWebSearchEnabled(v => !v)}
          title={webSearchEnabled ? 'Web Search ON — Gemini will query live search results' : 'Enable Web Search grounding'}
          className="group flex items-center gap-1.5 px-2 py-1 transition-all duration-150 rounded"
          style={{
            border: '0.5px solid var(--color-stone)',
            background: 'transparent',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-ash)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-stone)';
          }}
        >
          <div className="flex items-center gap-1">
            <span style={{ fontSize: 10 }}>🔍</span>
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-ghost group-hover:text-fog transition-colors">Web</span>
          </div>
          
          <div 
            className="relative w-6 h-3 rounded-full transition-colors duration-200"
            style={{ background: webSearchEnabled ? '#0EA5E9' : 'var(--color-stone)' }}
          >
            <div 
              className="absolute top-[2px] bg-void rounded-full transition-all duration-200"
              style={{
                left: webSearchEnabled ? 'calc(100% - 10px)' : '2px',
                width: '8px',
                height: '8px',
              }}
            />
          </div>

        </button>
        {/* Execute or Cancel */}
        {isExecuting ? (
          <button
            onClick={() => cancelContinuation(continuationIndex)}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 transition-all duration-150"
            style={{
              border: '0.5px solid rgba(239,68,68,0.7)',
              background: 'rgba(239,68,68,0.08)',
              color: '#EF4444',
              cursor: 'pointer',
            }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={textLen < 10}
            className="font-mono text-[10px] uppercase tracking-[0.15em] px-4 py-1.5 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ border: '0.5px solid var(--color-signal)', color: 'var(--color-signal)', background: 'transparent', cursor: 'pointer' }}
            onMouseEnter={(e) => { if (textLen >= 10) { const el = e.currentTarget; el.style.background = 'var(--color-signal)'; el.style.color = 'var(--color-void)'; } }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.background = 'transparent'; el.style.color = 'var(--color-signal)'; }}
          >
            EXECUTE →
          </button>
        )}
        {/* Export tree button */}
        {state.activeSession?.status === 'complete' && (
          <button
            onClick={() => state.activeSession && downloadMarkdown(state.activeSession)}
            title="Download entire session tree as Markdown"
            className="flex items-center justify-center transition-colors rounded"
            style={{
              width: 24,
              height: 24,
              background: 'transparent',
              border: '0.5px solid var(--color-stone)',
              color: 'var(--color-ghost)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-ash)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-stone)'; }}
            aria-label="Export tree as Markdown"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        )}
      </div>


      <DeleteButton />

      <Handle type="target" position={Position.Left}
        style={{ background: 'var(--color-stone)', width: 6, height: 6, border: 'none' }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: 'var(--color-stone)', width: 6, height: 6, border: 'none' }} />
    </div>
  );
}

export default memo(ContinuationInputNodeComponent);
