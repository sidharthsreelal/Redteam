// ── Edge style utility ────────────────────────────────────────────────────────
// Returns React Flow edge style objects for the two edge categories.

export type EdgeCategory = 'intra' | 'inter';

export function getEdgeStyle(
  category: EdgeCategory,
  theme: 'dark' | 'light',
  isComplete: boolean,
  accentColour?: string   // optional: tint the intra edge with framework accent
): React.CSSProperties {
  if (category === 'inter') {
    // Synthesis → Continuation Input  (cross-generation, always vivid)
    if (theme === 'light') {
      return {
        stroke: '#EF4444',
        strokeWidth: 3.5,
        opacity: 1,
        strokeDasharray: '5 4',
      };
    }
    return {
      stroke: '#10B981',
      strokeWidth: 3.5,
      opacity: 1,
      strokeDasharray: '5 4',
    };
  }

  // ── Intra-generation ─────────────────────────────────────────────────────
  if (isComplete) {
    return {
      stroke: theme === 'light' ? '#6B7280' : '#374151',
      strokeWidth: 1.5,
      strokeDasharray: 'none',
      opacity: 0.85,
    };
  }

  // Streaming / idle intra edge
  const baseStroke = theme === 'light' ? '#9CA3AF' : '#4B5563';
  const stroke = accentColour
    ? accentColour   // caller will set opacity via the edge's animated prop
    : baseStroke;

  return {
    stroke,
    strokeWidth: 1.5,
    strokeDasharray: '5 4',
    opacity: theme === 'light' ? (accentColour ? 0.4 : 1) : 1,
  };
}

// ── Accent opacity helper ─────────────────────────────────────────────────────
// Returns a colour string with the correct opacity for each node-level use case.
export type AccentContext =
  | 'border'
  | 'dot'
  | 'cursor'
  | 'glow'
  | 'chip-bg';

export function getAccentOpacity(
  accentColour: string,
  context: AccentContext,
  theme: 'dark' | 'light'
): string {
  // Helpers to produce rgba from hex
  const hex = accentColour.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const rgba = (a: number) => `rgba(${r},${g},${b},${a})`;

  switch (context) {
    case 'border':
      // Full opacity always — the spec asks for clearly visible borders
      return accentColour;
    case 'dot':
      return accentColour;
    case 'cursor':
      return accentColour;
    case 'glow':
      return rgba(theme === 'dark' ? 0.40 : 0.25);
    case 'chip-bg':
      return rgba(theme === 'dark' ? 0.20 : 0.15);
    default:
      return accentColour;
  }
}
