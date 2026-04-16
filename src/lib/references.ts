/**
 * Reference ID utility for @-mention system.
 *
 * Format: @{nodeIndex}-{framework-slug}
 * Examples:
 *   @n0-devils-advocate   ← root session
 *   @n0-synthesis
 *   @n1-pre-mortem        ← Continuation 1
 *   @n0-input
 */

import type { Session } from './types';

export interface NodeReference {
  slug: string;          // e.g. "@r1-devils-advocate"
  frameworkName: string; // e.g. "Devil's Advocate"
  round: number;         // 1 = root, 2 = first continuation, etc.
  content: string;       // full output text
  accent: string;        // hex colour for chips & picker dots
  available: boolean;    // false if the underlying node was deleted
}

/** Convert a frameworkId to a URL-safe slug portion. */
function toSlugPart(frameworkId: string): string {
  // Already kebab-cased in most places; strip continuation suffixes like "-cont-2"
  return frameworkId.replace(/-cont-\d+$/, '');
}

/** Build the reference slug from node index + framework slug. */
export function buildRefSlug(nodeIndex: number, frameworkId: string): string {
  return `@n${nodeIndex}-${toSlugPart(frameworkId)}`;
}

/** Fuzzy match — does `query` (lowercased) appear in `slug`? */
export function fuzzyMatch(slug: string, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().replace(/^@/, '');
  const s = slug.toLowerCase().replace(/^@/, '');
  // Direct substring match first
  if (s.includes(q)) return true;
  // Subsequence match
  let si = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = s.indexOf(q[qi], si);
    if (idx === -1) return false;
    si = idx + 1;
  }
  return true;
}

/**
 * Collect all completed node references from the active session,
 * ordered by round (root first, then continuations in index order).
 */
export function collectReferences(
  session: Session,
  frameworkAccents: Record<string, string>  // frameworkId → accent hex
): NodeReference[] {
  const refs: NodeReference[] = [];

  // ── Node 0: root input ──
  // Root session has no continuation number, so it uses @n0-*
  refs.push({
    slug: '@n0-input',
    frameworkName: 'Input',
    round: 0,
    content: session.input,
    accent: '#6B7280',
    available: true,
  });

  // ── Node 0: root framework outputs ──
  for (const fo of session.frameworkOutputs) {
    if (fo.status !== 'complete') continue;
    refs.push({
      slug: buildRefSlug(0, fo.frameworkId),
      frameworkName: formatFrameworkName(fo.frameworkId),
      round: 0,
      content: fo.content,
      accent: frameworkAccents[fo.frameworkId] ?? '#6B7280',
      available: true,
    });
  }

  // ── Node 0: root synthesis ──
  if (session.synthesisOutput.status === 'complete') {
    refs.push({
      slug: '@n0-synthesis',
      frameworkName: 'Synthesis',
      round: 0,
      content: session.synthesisOutput.content,
      accent: '#3B82F6',
      available: true,
    });
  }

  // ── Continuation nodes ──
  // cont.index is the exact number shown on the node label ("NODE N")
  // so @nN maps directly to cont.index === N — no arithmetic needed
  const conts = (session.continuations || [])
    .filter((c) => c.status === 'complete' || c.status === 'executing')
    .sort((a, b) => a.index - b.index);

  for (const cont of conts) {
    const nodeIdx = cont.index;  // direct: "Node 9" → @n9-*

    for (const fo of cont.frameworkOutputs) {
      if (fo.status !== 'complete') continue;
      refs.push({
        slug: buildRefSlug(nodeIdx, fo.frameworkId),
        frameworkName: formatFrameworkName(fo.frameworkId),
        round: nodeIdx,
        content: fo.content,
        accent: frameworkAccents[toSlugPart(fo.frameworkId)] ?? '#6B7280',
        available: true,
      });
    }

    if (cont.synthesisOutput.status === 'complete') {
      refs.push({
        slug: `@n${nodeIdx}-synthesis`,
        frameworkName: 'Synthesis',
        round: nodeIdx,
        content: cont.synthesisOutput.content,
        accent: '#3B82F6',
        available: true,
      });
    }
  }

  return refs;
}

/** Turns "devils-advocate" into "Devil's Advocate" */
function formatFrameworkName(id: string): string {
  const cleaned = id
    .replace(/-cont-\d+$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Special-case common names
  const overrides: Record<string, string> = {
    'Devils Advocate': "Devil's Advocate",
    'Pre Mortem': 'Pre-Mortem',
    'Second Order': 'Second-Order',
    'Red Team': 'Red Team',
    'Chat Response': 'Chat',
  };
  return overrides[cleaned] ?? cleaned;
}

/**
 * Build the REFERENCED CONTEXT block that is prepended to the API prompt.
 * Returns an empty string if refs is empty.
 */
export function buildReferencesBlock(refs: NodeReference[]): string {
  if (!refs.length) return '';

  const lines = ['REFERENCED CONTEXT (called explicitly by the user):\n'];
  for (const ref of refs) {
    if (!ref.available) continue;
    lines.push(`[${ref.slug} — ${ref.frameworkName}, Round ${ref.round}]:\n${ref.content}\n`);
  }
  lines.push('---');
  return lines.join('\n');
}
