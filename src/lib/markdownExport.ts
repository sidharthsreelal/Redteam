/**
 * markdownExport.ts
 * Converts a Session (and all its continuations) into a single Markdown document.
 */

import type { Session, ContinuationGeneration, FrameworkOutput } from './types';
import { MODES } from './modes';

// ── Helpers ──────────────────────────────────────────────────────────────────

function hr(char = '-', len = 60): string {
  return char.repeat(len);
}

function sectionBlock(label: string, content: string): string {
  if (!content || !content.trim()) return '';
  return `### ${label}\n\n${content.trim()}\n`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Build output for one round ────────────────────────────────────────────────

function renderFrameworkOutputs(
  outputs: FrameworkOutput[],
  modeId: string,
  round: number | 'root'
): string {
  const mode = MODES.find((m) => m.id === modeId);
  const blocks: string[] = [];

  for (const fo of outputs) {
    if (!fo.content?.trim()) continue;

    const fw = mode?.frameworks.find((f) => f.id === fo.frameworkId);
    const label = fw ? `${fw.title} (${fw.label})` : fo.frameworkId;
    const roundTag = round === 'root' ? '' : ` · Round ${round}`;

    blocks.push(`#### ${label}${roundTag}\n\n${fo.content.trim()}`);
  }

  return blocks.join('\n\n' + hr('-', 40) + '\n\n');
}

function renderRound(
  input: string,
  modeId: string,
  modeName: string,
  outputs: FrameworkOutput[],
  synthesisOutput: FrameworkOutput,
  round: number | 'root'
): string {
  const parts: string[] = [];

  const roundHeader = round === 'root'
    ? `## Root Analysis — ${modeName}`
    : `## Round ${round} — ${modeName}`;

  parts.push(roundHeader);
  parts.push('');
  parts.push(sectionBlock('Input', input));

  const fwBlock = renderFrameworkOutputs(outputs, modeId, round);
  if (fwBlock) {
    parts.push('### Frameworks\n');
    parts.push(fwBlock);
  }

  if (synthesisOutput.content?.trim()) {
    parts.push(sectionBlock('Synthesis', synthesisOutput.content));
  }

  return parts.join('\n');
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function sessionToMarkdown(session: Session): string {
  const lines: string[] = [];

  // Document title & meta
  lines.push(`# Red Team Analysis`);
  lines.push('');
  lines.push(`**Session:** ${session.modeName}  `);
  lines.push(`**Created:** ${formatTimestamp(session.timestamp)}  `);
  lines.push(`**Input:** ${session.input.slice(0, 120)}${session.input.length > 120 ? '…' : ''}`);
  lines.push('');
  lines.push(hr('=', 60));
  lines.push('');

  // Root round
  lines.push(renderRound(
    session.input,
    session.modeId,
    session.modeName,
    session.frameworkOutputs,
    session.synthesisOutput,
    'root',
  ));

  // Continuations (BFS order by index)
  const continuations = [...(session.continuations ?? [])].sort((a, b) => a.index - b.index);
  for (const cont of continuations) {
    if (cont.status === 'input') continue; // pending, skip

    lines.push('');
    lines.push(hr('=', 60));
    lines.push('');
    lines.push(renderRound(
      cont.input,
      cont.modeId,
      cont.modeName,
      cont.frameworkOutputs,
      cont.synthesisOutput,
      cont.index,
    ));
  }

  lines.push('');
  lines.push(hr('-', 60));
  lines.push('');
  lines.push(`*Exported from Red Team · ${formatTimestamp(Date.now())}*`);

  return lines.join('\n');
}

/** Triggers a browser download of the Markdown */
export function downloadMarkdown(session: Session): void {
  const md = sessionToMarkdown(session);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const slug = session.input.slice(0, 40).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  a.download = `redteam-${slug}-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download only a single node's content as Markdown */
export function downloadNodeMarkdown(title: string, label: string, content: string): void {
  const md = `# ${title}\n\n*${label}*\n\n${hr('-', 40)}\n\n${content}`;
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const slug = title.slice(0, 40).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  a.download = `redteam-node-${slug}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
