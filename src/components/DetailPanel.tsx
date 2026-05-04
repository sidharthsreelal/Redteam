'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useApp } from '@/lib/store';
import { MODES } from '@/lib/modes';
import type { Session } from '@/lib/types';
import ExportButton from './nodes/ExportButton';
import { downloadMarkdown } from '@/lib/markdownExport';
import { StreamingBus } from '@/lib/streamingBus';

// ── Code block component (Claude-style) ──────────────────────
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const lang = language || 'text';

  return (
    <div
      style={{
        margin: '10px 0',
        borderRadius: 6,
        overflow: 'hidden',
        border: '0.5px solid var(--color-stone)',
        background: 'var(--color-void)',
        fontSize: 12,
      }}
    >
      {/* Language banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 10px',
          background: 'var(--color-slate)',
          borderBottom: '0.5px solid var(--color-stone)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--color-fog)',
            userSelect: 'none',
          }}
        >
          {lang}
        </span>
        <button
          onClick={handleCopy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: 3,
            color: copied ? '#10B981' : 'var(--color-fog)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10,
            letterSpacing: '0.08em',
            transition: 'color 150ms',
          }}
          title="Copy code"
          aria-label="Copy code"
        >
          {copied ? (
            // Check icon
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            // Copy icon
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Scrollable code body */}
      <div
        style={{
          maxHeight: 280,
          overflowY: 'auto',
          overflowX: 'auto',
        }}
      >
        <pre
          style={{
            margin: 0,
            padding: '10px 12px',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            lineHeight: 1.65,
            color: 'var(--color-cloud)',
            whiteSpace: 'pre',
            tabSize: 2,
          }}
        >
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

export default function DetailPanel() {
  const { state, dispatch, rerunFramework, cancelSession, isExecuting } = useApp();
  const { activeSession, detailPanelOpen, detailPanelNodeId } = state;

  if (!detailPanelOpen || !detailPanelNodeId || !activeSession) return null;

  // Resolve content for any node ID — base session or continuation
  const resolved = resolveNode(detailPanelNodeId, activeSession, state.selectedMode ? state.selectedMode : undefined);

  // Is this a primary framework node (not synthesis, input, or continuation)?
  const isPrimaryFramework = !['input', 'synthesis'].includes(detailPanelNodeId)
    && !detailPanelNodeId.includes('-cont-')
    && !detailPanelNodeId.startsWith('synthesis-cont-')
    && !detailPanelNodeId.startsWith('cont-input-');

  const isInputNodeFn = detailPanelNodeId === 'input' || detailPanelNodeId.startsWith('cont-input-');
  const isSynthesisNodeFn = detailPanelNodeId === 'synthesis' || detailPanelNodeId.startsWith('synthesis-cont-');

  // Rerun logic for input nodes and primary frameworks.
  let onRerun = undefined;
  if (isPrimaryFramework) {
    onRerun = () => rerunFramework(detailPanelNodeId);
  } else if (detailPanelNodeId === 'input') {
    onRerun = () => rerunFramework('input', null);
  } else if (detailPanelNodeId.startsWith('cont-input-')) {
    const idx = parseInt(detailPanelNodeId.replace('cont-input-', ''), 10);
    onRerun = () => rerunFramework('input', idx);
  }

  return (
    <>
      {/* Desktop side panel */}
      <div
        className="hidden lg:flex w-[380px] min-w-[380px] h-full bg-ink flex-col overflow-hidden"
        style={{ borderLeft: '0.5px solid var(--color-stone)' }}
      >
        <PanelContent
          {...resolved}
          nodeId={detailPanelNodeId}
          session={activeSession}
          onClose={() => dispatch({ type: 'CLOSE_DETAIL' })}
          onRerun={onRerun}
          onCancelSession={isExecuting ? cancelSession : undefined}
          onExportTree={(isInputNodeFn || isSynthesisNodeFn) ? () => downloadMarkdown(activeSession) : undefined}
        />
      </div>

      {/* Mobile bottom drawer */}
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-ink flex flex-col"
        style={{ height: '50vh', borderTop: '0.5px solid var(--color-stone)' }}
      >
        <PanelContent
          {...resolved}
          nodeId={detailPanelNodeId}
          session={activeSession}
          onClose={() => dispatch({ type: 'CLOSE_DETAIL' })}
          onRerun={onRerun}
          onCancelSession={isExecuting ? cancelSession : undefined}
          onExportTree={(isInputNodeFn || isSynthesisNodeFn) ? () => downloadMarkdown(activeSession) : undefined}
        />
      </div>
    </>
  );
}

// ── Resolver ─────────────────────────────────────────────────
function resolveNode(
  nodeId: string,
  session: Session,
  selectedMode: ReturnType<typeof MODES.find> | undefined
) {
  let label = '';
  let title = '';
  let accent = '#3B82F6';
  let content = '';
  let status = '';

  // 1. Input node
  if (nodeId === 'input') {
    return { label: 'INPUT', title: 'User Input', accent: '#3B82F6', content: session.input, status: 'complete' };
  }

  // 2. Primary synthesis node
  if (nodeId === 'synthesis') {
    return {
      label: 'SYNTHESIS',
      title: 'Strengthen Your Plan',
      accent: '#3B82F6',
      content: session.synthesisOutput.content,
      status: session.synthesisOutput.status,
    };
  }

  // 3. Continuation synthesis nodes: "synthesis-cont-node-{index}"
  const contSynthMatch = nodeId.match(/^synthesis-cont-node-(\d+)$/);
  if (contSynthMatch) {
    const idx = parseInt(contSynthMatch[1], 10);
    const cont = session.continuations?.find((c) => c.index === idx);
    if (cont) {
      return {
        label: `SYNTHESIS · ROUND ${idx}`,
        title: 'Strengthen Your Plan',
        accent: '#3B82F6',
        content: cont.synthesisOutput.content,
        status: cont.synthesisOutput.status,
      };
    }
  }

  // 4. Continuation input node: "cont-input-{index}"
  const contInputMatch = nodeId.match(/^cont-input-(\d+)$/);
  if (contInputMatch) {
    const idx = parseInt(contInputMatch[1], 10);
    const cont = session.continuations?.find((c) => c.index === idx);
    if (cont) {
      return {
        label: `FOLLOW-UP · ROUND ${idx}`,
        title: cont.modeName,
        accent: '#14B8A6',
        content: cont.input || '(awaiting input)',
        status: cont.status === 'complete' ? 'complete' : 'idle',
      };
    }
  }

  // 5. Continuation framework nodes: "{frameworkId}-cont-{index}"
  const contFwMatch = nodeId.match(/^(.+)-cont-(\d+)$/);
  if (contFwMatch) {
    const fwId = contFwMatch[1];
    const idx = parseInt(contFwMatch[2], 10);
    const cont = session.continuations?.find((c) => c.index === idx);
    if (cont) {
      // Find framework definition from the continuation's mode
      const contMode = MODES.find((m) => m.id === cont.modeId);
      const framework = contMode?.frameworks.find((f) => f.id === fwId);
      const output = cont.frameworkOutputs.find((fo) => fo.frameworkId === fwId);
      if (output) {
        return {
          label: framework ? `${framework.label} · ROUND ${idx}` : `ROUND ${idx}`,
          title: framework?.title || fwId,
          accent: (framework?.accent as string) || '#3B82F6',
          content: output.content,
          status: output.status,
        };
      }
    }
  }

  // 6. Primary framework nodes
  const mode = selectedMode;
  const framework = mode?.frameworks.find((f) => f.id === nodeId);
  const output = session.frameworkOutputs.find((fo) => fo.frameworkId === nodeId);
  if (framework && output) {
    label = framework.label;
    title = framework.title;
    accent = framework.accent;
    content = output.content;
    status = output.status;
  }

  return { label, title, accent, content, status };
}

// ── Bus ID resolver: maps a panel nodeId to its StreamingBus channel ─────────
function resolveBusId(nodeId: string): string {
  // Continuation synthesis: synthesis-cont-node-{index}
  const contSynth = nodeId.match(/^synthesis-cont-node-(\d+)$/);
  if (contSynth) return `synthesis-cont-${contSynth[1]}`;
  // Continuation framework: {frameworkId}-cont-{index}
  const contFw = nodeId.match(/^(.+)-cont-(\d+)$/);
  if (contFw) return `${contFw[1]}-cont-${contFw[2]}`;
  // Primary synthesis or framework — id is the bus id directly
  return nodeId;
}

// ── Panel content component ───────────────────────────────────
function PanelContent({
  label, title, accent, content, status, nodeId, session, onClose, onRerun, onCancelSession, onExportTree,
}: {
  label: string;
  title: string;
  accent: string;
  content: string;
  status: string;
  nodeId: string;
  session: Pick<Session, 'input' | 'modeName' | 'timestamp'>;
  onClose: () => void;
  onRerun?: () => Promise<void>;
  onCancelSession?: () => void;
  onExportTree?: () => void;
}) {
  const [rerunning, setRerunning] = useState(false);

  // ── Live streaming refs ───────────────────────────────────────
  const streamContentRef = useRef<HTMLDivElement>(null);
  const streamScrollRef  = useRef<HTMLDivElement>(null);
  const streamCursorRef  = useRef<HTMLSpanElement>(null);
  const isStreamingRef   = useRef(false);

  useEffect(() => {
    if (status !== 'streaming') {
      isStreamingRef.current = false;
      return;
    }

    const busId = resolveBusId(nodeId);
    isStreamingRef.current = true;

    // Clear any previous content when streaming starts fresh
    if (streamContentRef.current) streamContentRef.current.textContent = '';
    if (streamCursorRef.current)  streamCursorRef.current.style.opacity = '1';

    const unsub = StreamingBus.subscribe(busId, (text) => {
      if (!isStreamingRef.current) return;
      if (streamContentRef.current) {
        // Write the full accumulated text — panel is tall enough to show everything
        streamContentRef.current.textContent = text;
      }
      // Auto-scroll to keep the cursor visible at the bottom
      if (streamScrollRef.current) {
        streamScrollRef.current.scrollTop = streamScrollRef.current.scrollHeight;
      }
    });

    return () => {
      isStreamingRef.current = false;
      unsub();
    };
  }, [nodeId, status]);

  const handleRerun = async () => {
    if (!onRerun || rerunning) return;
    setRerunning(true);
    await onRerun();
    setRerunning(false);
  };

  return (
    <>
      {/* Header */}
      <div
        className="px-5 py-4 flex items-start justify-between flex-shrink-0"
        style={{ borderBottom: '0.5px solid var(--color-stone)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-0.5 h-8 rounded-full flex-shrink-0"
            style={{ background: accent }}
          />
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-ghost">
              {label}
            </p>
            <p className="font-mono text-[13px] text-cloud mt-0.5">{title}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-4">
          {status === 'streaming' && (
            <div className="w-2 h-2 rounded-full pulse-dot flex-shrink-0" style={{ background: accent }} />
          )}
          {status === 'complete' && (
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent, opacity: 0.6 }} />
          )}
          {/* Redo button — only shown for primary framework nodes */}
          {onRerun && (
            <button
              onClick={handleRerun}
              disabled={rerunning}
              title="Rerun this framework and regenerate synthesis"
              className="flex items-center justify-center rounded transition-colors"
              style={{
                width: 22,
                height: 22,
                background: rerunning ? 'var(--color-slate)' : 'transparent',
                border: `0.5px solid ${rerunning ? accent : 'var(--color-stone)'}`,
                color: rerunning ? accent : 'var(--color-ghost)',
                cursor: rerunning ? 'not-allowed' : 'pointer',
                flexShrink: 0,
                opacity: rerunning ? 0.7 : 1,
              }}
              aria-label="Rerun framework"
            >
              {rerunning ? (
                // Spinning arc
                <svg
                  width="11" height="11" viewBox="0 0 11 11"
                  style={{ animation: 'spin 0.8s linear infinite' }}
                >
                  <circle
                    cx="5.5" cy="5.5" r="4"
                    fill="none" stroke="currentColor" strokeWidth="1.5"
                    strokeDasharray="16 8"
                  />
                </svg>
              ) : (
                // Redo arrow icon
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 7a9 9 0 1 0 .75 6" />
                  <polyline points="21 2 21 8 15 8" />
                </svg>
              )}
            </button>
          )}
          {/* Cancel button — only shown while executing */}
          {onCancelSession && (
            <button
              onClick={onCancelSession}
              title="Cancel all in-flight requests"
              className="flex items-center justify-center rounded transition-all duration-150"
              style={{
                padding: '2px 7px',
                height: 22,
                background: 'rgba(239,68,68,0.08)',
                border: '0.5px solid rgba(239,68,68,0.5)',
                color: '#EF4444',
                cursor: 'pointer',
                flexShrink: 0,
                gap: 4,
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label="Cancel generation"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em]">Stop</span>
            </button>
          )}
          {/* Export tree button */}
          {onExportTree && (
            <button
              onClick={onExportTree}
              title="Download entire session tree as Markdown"
              className="flex items-center justify-center rounded transition-colors"
              style={{
                width: 22,
                height: 22,
                background: 'transparent',
                border: '0.5px solid var(--color-stone)',
                color: 'var(--color-ghost)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              aria-label="Export tree as Markdown"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          )}
          {/* ExportButton: copy or download this specific node as Markdown */}
          <ExportButton
            getText={() => `${label}\n\n${title}\n${'─'.repeat(40)}\n\n${content}`}
            getMarkdown={() => ({ title, label, content })}
          />
          <button
            onClick={onClose}
            className="font-mono text-lg text-ghost hover:text-fog transition-colors leading-none flex-shrink-0"
            aria-label="Close panel"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={streamScrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {nodeId === 'input' ? (
          <p className="text-[13px] text-fog leading-[1.75]">{content}</p>

        ) : status === 'streaming' ? (
          // ── Live streaming view: direct DOM writes via StreamingBus ──
          <div>
            <p
              ref={streamContentRef}
              className="text-[13px] text-fog leading-[1.75] whitespace-pre-wrap"
              style={{ margin: 0 }}
            />
            {/* blinking cursor */}
            <span
              ref={streamCursorRef}
              className="cursor-blink inline-block align-middle ml-0.5"
              style={{ width: 2, height: 16, background: accent, verticalAlign: 'middle' }}
            />
          </div>

        ) : content ? (
          <div className="prose-redteam">
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p className="text-[13px] text-fog leading-[1.75] mb-3">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="text-cloud font-medium">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="text-fog italic">{children}</em>
                ),
                ul: ({ children }) => (
                  <ul className="text-[13px] text-fog leading-[1.75] mb-3 pl-4 space-y-1 list-disc">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="text-[13px] text-fog leading-[1.75] mb-3 pl-4 space-y-1 list-decimal">{children}</ol>
                ),
                li: ({ children }) => <li>{children}</li>,
                h1: ({ children }) => (
                  <p className="font-mono text-xs text-cloud uppercase tracking-wider mb-2 mt-4">{children}</p>
                ),
                h2: ({ children }) => (
                  <p className="font-mono text-xs text-cloud uppercase tracking-wider mb-2 mt-4">{children}</p>
                ),
                h3: ({ children }) => (
                  <p className="font-mono text-[11px] text-cloud uppercase tracking-wider mb-1 mt-3">{children}</p>
                ),
                // Inline code (backtick spans)
                code: ({ children, className }) => {
                  // If inside a pre, the pre renderer handles it — skip
                  return (
                    <code
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 11,
                        color: 'var(--color-cloud)',
                        background: 'var(--color-slate)',
                        padding: '1px 5px',
                        borderRadius: 3,
                        border: '0.5px solid var(--color-stone)',
                      }}
                    >
                      {children}
                    </code>
                  );
                },
                // Fenced code blocks
                pre: ({ children }) => {
                  // Extract language and code string from the nested <code> child
                  const child = Array.isArray(children) ? children[0] : children;
                  if (
                    child &&
                    typeof child === 'object' &&
                    'props' in child
                  ) {
                    const { className, children: codeChildren } = (child as { props: { className?: string; children?: unknown } }).props;
                    const lang = (className || '').replace('language-', '');
                    const code = typeof codeChildren === 'string' ? codeChildren.trimEnd() : String(codeChildren ?? '');
                    return <CodeBlock language={lang} code={code} />;
                  }
                  // Fallback: render as plain pre
                  return (
                    <pre
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 12,
                        color: 'var(--color-cloud)',
                        background: 'var(--color-void)',
                        border: '0.5px solid var(--color-stone)',
                        borderRadius: 6,
                        padding: '10px 12px',
                        overflowX: 'auto',
                        maxHeight: 280,
                        margin: '10px 0',
                      }}
                    >
                      {children}
                    </pre>
                  );
                },
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-stone pl-3 my-2 text-fog italic">{children}</blockquote>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-[12px] text-ghost font-mono uppercase tracking-wider opacity-50 mt-4">
            {status === 'idle' ? 'Awaiting execution…' : 'No content available'}
          </p>
        )}
      </div>

      {/* Footer */}
      {nodeId === 'input' && (
        <div className="px-5 py-3 flex-shrink-0" style={{ borderTop: '0.5px solid var(--color-stone)' }}>
          <p className="font-mono text-[9px] text-ghost uppercase tracking-[0.15em]">
            MODE: {session.modeName}
          </p>
          <p className="font-mono text-[9px] text-ghost mt-1">
            {new Date(session.timestamp).toLocaleString()}
          </p>
        </div>
      )}
    </>
  );
}
