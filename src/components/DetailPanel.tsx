'use client';

import ReactMarkdown from 'react-markdown';
import { useApp } from '@/lib/store';

export default function DetailPanel() {
  const { state, dispatch } = useApp();
  const { activeSession, detailPanelOpen, detailPanelNodeId } = state;

  if (!detailPanelOpen || !detailPanelNodeId || !activeSession) return null;

  let label = '';
  let title = '';
  let accent = '#3B82F6';
  let content = '';
  let status = '';

  if (detailPanelNodeId === 'input') {
    label = 'INPUT';
    title = 'User Input';
    content = activeSession.input;
    status = 'complete';
    accent = '#3B82F6';
  } else if (detailPanelNodeId === 'synthesis') {
    label = 'SYNTHESIS';
    title = 'Strengthen Your Plan';
    content = activeSession.synthesisOutput.content;
    status = activeSession.synthesisOutput.status;
    accent = '#3B82F6';
  } else {
    const mode = state.selectedMode;
    const framework = mode?.frameworks.find((f) => f.id === detailPanelNodeId);
    const output = activeSession.frameworkOutputs.find(
      (fo) => fo.frameworkId === detailPanelNodeId
    );
    if (framework && output) {
      label = framework.label;
      title = framework.title;
      accent = framework.accent;
      content = output.content;
      status = output.status;
    }
  }

  return (
    <>
      {/* Desktop side panel */}
      <div
        className="hidden lg:flex w-[380px] min-w-[380px] h-full bg-ink flex-col overflow-hidden"
        style={{ borderLeft: '0.5px solid var(--color-stone)' }}
      >
        <PanelContent
          label={label}
          title={title}
          accent={accent}
          content={content}
          status={status}
          nodeId={detailPanelNodeId}
          session={activeSession}
          onClose={() => dispatch({ type: 'CLOSE_DETAIL' })}
        />
      </div>

      {/* Mobile bottom drawer */}
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-ink flex flex-col"
        style={{
          height: '50vh',
          borderTop: '0.5px solid var(--color-stone)',
        }}
      >
        <PanelContent
          label={label}
          title={title}
          accent={accent}
          content={content}
          status={status}
          nodeId={detailPanelNodeId}
          session={activeSession}
          onClose={() => dispatch({ type: 'CLOSE_DETAIL' })}
        />
      </div>
    </>
  );
}

function PanelContent({
  label, title, accent, content, status, nodeId, session, onClose,
}: {
  label: string;
  title: string;
  accent: string;
  content: string;
  status: string;
  nodeId: string;
  session: { input: string; modeName: string; timestamp: number };
  onClose: () => void;
}) {
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
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {nodeId === 'input' ? (
          <p className="text-[13px] text-fog leading-[1.75]">{content}</p>
        ) : (
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
                code: ({ children }) => (
                  <code className="font-mono text-[12px] text-cloud bg-slate px-1 rounded">{children}</code>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-stone pl-3 my-2 text-fog italic">{children}</blockquote>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
            {status === 'streaming' && (
              <span
                className="inline-block w-0.5 h-3.5 cursor-blink align-middle ml-0.5"
                style={{ background: accent }}
              />
            )}
          </div>
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
