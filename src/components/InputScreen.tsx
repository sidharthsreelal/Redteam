'use client';

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useApp } from '@/lib/store';
import { EXAMPLE_PROMPTS, EXAMPLE_PROMPTS_BY_MODE } from '@/lib/modes';
import ModeSelector from './ModeSelector';
import type { UploadedDocument } from '@/lib/types';
import { extractText, detectFileType, ACCEPTED_FILE_TYPES } from '@/lib/documentParser';

export default function InputScreen() {
  const { state, dispatch, executeSession } = useApp();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const charCount = state.userInput.length;
  const canSubmit = charCount >= 15;

  // ── Web search toggle ────────────────────────────────────────────────────
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  // ── Document upload state ────────────────────────────────────────────────
  // Pending docs are held locally until the session starts (no activeSession yet at this point).
  // On EXECUTE we upload them to the new session via the store.
  const [pendingDocs, setPendingDocs] = useState<UploadedDocument[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Also show docs that have been attached to the active session
  const sessionDocs = state.activeSession?.uploadedDocuments ?? [];
  const allDocs = state.canvasState === 'input' ? pendingDocs : sessionDocs;

  // Pick 4 random prompts from the current mode's bank each time the mode changes
  const examplePrompts = useMemo(() => {
    const pool = state.selectedMode
      ? (EXAMPLE_PROMPTS_BY_MODE[state.selectedMode.id] ?? EXAMPLE_PROMPTS)
      : EXAMPLE_PROMPTS;
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, 4);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedMode?.id]);

  // Focus input and scroll into view when mode changes
  useEffect(() => {
    if (state.selectedMode) {
      inputRef.current?.focus({ preventScroll: true });
      inputContainerRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [state.selectedMode]);

  // Clear pending docs when we navigate back to empty/input from active
  useEffect(() => {
    if (state.canvasState === 'input') {
      setPendingDocs([]);
      setUploadError(null);
    }
  }, [state.canvasState]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) return;
      e.preventDefault();
      if (canSubmit) handleExecute();
    }
  };

  const handleExecute = useCallback(() => {
    executeSession(webSearchEnabled, pendingDocs.length > 0 ? pendingDocs : undefined);
  }, [executeSession, webSearchEnabled, pendingDocs]);

  // ── File upload handler ──────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploadError(null);

    const supported = fileArray.filter(f => detectFileType(f) !== null);
    const unsupported = fileArray.filter(f => detectFileType(f) === null);

    if (unsupported.length > 0) {
      setUploadError(`Unsupported: ${unsupported.map(f => f.name).join(', ')}. Supported: PDF, DOCX, TXT, MD`);
    }

    if (supported.length === 0) return;

    setUploadingCount(c => c + supported.length);

    const results: UploadedDocument[] = [];
    for (const file of supported) {
      try {
        const content = await extractText(file);
        results.push({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          content,
          size: file.size,
          uploadedAt: Date.now(),
        });
      } catch (err) {
        setUploadError(`Failed to parse ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setUploadingCount(c => c - 1);
      }
    }

    if (state.canvasState === 'active' && state.activeSession) {
      // Session already running — dispatch to store
      dispatch({ type: 'UPLOAD_DOCUMENTS', docs: results });
    } else {
      // Pre-session — hold locally
      setPendingDocs(prev => [...prev, ...results]);
    }
  }, [dispatch, state.canvasState, state.activeSession]);

  const handleRemoveDoc = useCallback((docId: string) => {
    if (state.canvasState === 'active' && state.activeSession) {
      dispatch({ type: 'REMOVE_DOCUMENT', docId });
    } else {
      setPendingDocs(prev => prev.filter(d => d.id !== docId));
    }
  }, [dispatch, state.canvasState, state.activeSession]);

  // ── Drag-and-drop ────────────────────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false);
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const formatBytes = (b: number) =>
    b < 1024 ? `${b}B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1024 / 1024).toFixed(1)}MB`;

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-smooth" style={{ scrollBehavior: 'smooth' }}>
      {/* Mode cards */}
      <div>
        <ModeSelector />
      </div>

      {/* Input area — appears when mode is selected */}
      {state.selectedMode && (
        <div ref={inputContainerRef} className="px-8 pb-8 transition-opacity duration-300 ease-out">
          {/* Selected mode indicator */}
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: state.selectedMode.accent }}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ghost">
              {state.selectedMode.name}
            </p>
          </div>

          {/* Textarea with drag-drop */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{ position: 'relative' }}
          >
            <textarea
              id="idea-input"
              ref={inputRef}
              autoFocus
              value={state.userInput}
              onChange={(e) => dispatch({ type: 'SET_INPUT', input: e.target.value.slice(0, 3000) })}
              onKeyDown={handleKeyDown}
              placeholder="Describe your idea, plan, decision, or argument..."
              className="w-full h-[160px] bg-void text-cloud text-sm px-4 py-3 resize-none outline-none placeholder:text-ghost"
              style={{
                border: isDragOver
                  ? `0.5px solid ${state.selectedMode.accent}`
                  : `0.5px solid ${state.selectedMode.accent}44`,
                lineHeight: '1.7',
                transition: 'border-color 200ms ease, box-shadow 200ms ease',
                outline: 'none',
                boxShadow: isDragOver ? `0 0 18px 4px ${state.selectedMode.accent}22` : 'none',
              }}
              onFocus={(e) => {
                if (!isDragOver) {
                  e.target.style.borderColor = state.selectedMode!.accent;
                  e.target.style.boxShadow = `0 0 18px 4px ${state.selectedMode!.accent}22`;
                }
              }}
              onBlur={(e) => {
                if (!isDragOver) {
                  e.target.style.borderColor = `${state.selectedMode!.accent}44`;
                  e.target.style.boxShadow = 'none';
                }
              }}
            />
            {isDragOver && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ background: `${state.selectedMode.accent}08` }}
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: state.selectedMode.accent }}>
                  Drop to attach document
                </p>
              </div>
            )}
          </div>

          {/* Document list */}
          {allDocs.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {allDocs.map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between px-3 py-1.5 rounded"
                  style={{ background: 'var(--color-ink)', border: '0.5px solid var(--color-stone)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span style={{ fontSize: 11 }}>📄</span>
                    <span className="font-mono text-[10px] text-fog truncate">{doc.name}</span>
                    <span className="font-mono text-[9px] text-ghost flex-shrink-0">{formatBytes(doc.size)}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveDoc(doc.id)}
                    className="font-mono text-[9px] text-ghost hover:text-red-400 transition-colors ml-3 flex-shrink-0"
                    title="Remove document"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadError && (
            <p className="font-mono text-[9px] mt-1.5" style={{ color: '#EF4444' }}>{uploadError}</p>
          )}

          {/* Counter + upload + web search + Submit row */}
          <div className="flex items-center justify-between mt-3 gap-2">
            <span className="font-mono text-[10px] text-ghost">
              {charCount} / 3000
            </span>

            <div className="flex items-center gap-2">
              {/* Upload button */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES}
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
              <button
                id="upload-doc-btn"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingCount > 0}
                title="Attach documents (PDF, DOCX, TXT, MD)"
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 transition-all duration-150 disabled:opacity-40"
                style={{
                  border: '0.5px solid var(--color-stone)',
                  background: allDocs.length > 0 ? 'rgba(16,185,129,0.08)' : 'transparent',
                  color: allDocs.length > 0 ? '#10B981' : 'var(--color-ghost)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget).style.borderColor = 'var(--color-ash)';
                  (e.currentTarget).style.color = 'var(--color-fog)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget).style.borderColor = 'var(--color-stone)';
                  (e.currentTarget).style.color = allDocs.length > 0 ? '#10B981' : 'var(--color-ghost)';
                }}
              >
                <span style={{ fontSize: 12 }}>📎</span>
                {uploadingCount > 0
                  ? `Parsing…`
                  : allDocs.length > 0
                    ? `${allDocs.length} doc${allDocs.length > 1 ? 's' : ''}`
                    : 'Attach'}
              </button>

              {/* Web Search toggle */}
              <button
                id="web-search-toggle-btn"
                type="button"
                onClick={() => setWebSearchEnabled(v => !v)}
                title={webSearchEnabled
                  ? 'Web Search ON — Gemini will use live Google Search grounding'
                  : 'Enable Web Search: Gemini queries live web results as evidence'}
                className="group flex items-center gap-2 px-3 py-1.5 transition-all duration-150"
                style={{
                  border: '0.5px solid var(--color-stone)',
                  background: 'transparent',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-ash)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-stone)';
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: 12 }}>🔍</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fog">Web</span>
                </div>
                
                <div 
                  className="relative w-8 h-4 rounded-full transition-colors duration-200"
                  style={{ background: webSearchEnabled ? '#0EA5E9' : 'var(--color-stone)' }}
                >
                  <div 
                    className="absolute top-[2px] bg-void rounded-full transition-all duration-200"
                    style={{
                      left: webSearchEnabled ? 'calc(100% - 14px)' : '2px',
                      width: '12px',
                      height: '12px',
                    }}
                  />
                </div>

              </button>

              {/* Execute */}
              <button
                id="execute-btn"
                onClick={handleExecute}
                disabled={!canSubmit}
                className="font-mono text-xs uppercase tracking-[0.15em] px-6 py-2.5 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  border: `0.5px solid ${state.selectedMode.accent}`,
                  background: 'transparent',
                  color: state.selectedMode.accent,
                }}
                onMouseEnter={(e) => {
                  if (canSubmit) {
                    (e.target as HTMLButtonElement).style.background = state.selectedMode!.accent;
                    (e.target as HTMLButtonElement).style.color = 'var(--color-void)';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.background = 'transparent';
                  (e.target as HTMLButtonElement).style.color = state.selectedMode!.accent;
                }}
              >
                EXECUTE →
              </button>
            </div>
          </div>

          {/* Example prompts */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            {examplePrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => {
                  dispatch({ type: 'SET_INPUT', input: prompt });
                  inputRef.current?.focus();
                }}
                className="text-left text-xs text-ghost p-3 rounded transition-colors duration-150 hover:text-fog"
                style={{ border: '0.5px solid var(--color-stone)' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-ash)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-stone)';
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Ghost node preview */}
          {state.selectedMode && (
            <div className="mt-8 flex items-center justify-center gap-6 opacity-20">
              <div
                className="w-16 h-10 rounded"
                style={{ border: '0.5px dashed var(--color-ghost)' }}
              />
              <div className="flex items-center gap-4">
                {state.selectedMode.frameworks.map((f) => (
                  <div key={f.id} className="flex items-center gap-2">
                    <div className="w-8 h-px bg-ghost" />
                    <div
                      className="w-12 h-10 rounded"
                      style={{ border: '0.5px dashed var(--color-ghost)' }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-px bg-ghost" />
                <div
                  className="w-16 h-10 rounded"
                  style={{ border: '0.5px dashed var(--color-ghost)' }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
