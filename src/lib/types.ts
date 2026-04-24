// ── Color accent map ──
export type AccentColor =
  | '#EF4444'  // red
  | '#F97316'  // orange
  | '#3B82F6'  // blue
  | '#8B5CF6'  // violet
  | '#F59E0B'  // amber
  | '#10B981'  // emerald
  | '#0EA5E9'  // sky
  | '#14B8A6'  // teal
  | '#06B6D4'  // cyan
  | '#EC4899'; // pink

// ── Framework definition ──
export interface Framework {
  id: string;
  label: string;
  title: string;
  accent: AccentColor;
  systemPrompt: string;
  userPromptTemplate: string;
  enableSearch?: boolean;  // opt-in Google Search grounding (Gemini only)
}

// ── Uploaded document (session-scoped, never persisted to localStorage) ──
export interface UploadedDocument {
  id: string;
  name: string;
  content: string;   // extracted plain text
  size: number;      // original file size in bytes
  uploadedAt: number;
}

// ── Mode definition ──
export interface Mode {
  id: string;
  name: string;
  tagline: string;
  accent: AccentColor;
  frameworks: Framework[];
}

// ── Framework output state ──
export type FrameworkStatus = 'idle' | 'streaming' | 'complete' | 'error';

export interface FrameworkOutput {
  frameworkId: string;
  status: FrameworkStatus;
  content: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

// ── Session Memory ──
export interface SessionMemory {
  coreIdea:         string;
  establishedFacts: string[];
  keyInsights:      string[];
  openQuestions:    string[];
  currentDirection: string;
  roundCount:       number;
  lastUpdatedAt:    number; // timestamp
}

// ── Session ──
export interface Session {
  id: string;
  modeId: string;
  modeName: string;
  input: string;
  frameworkOutputs: FrameworkOutput[];
  synthesisOutput: FrameworkOutput;
  timestamp: number;
  status: 'executing' | 'complete';
  continuations?: ContinuationGeneration[];
  sessionMemory?: SessionMemory;
  hasCodeIntent?: boolean; // Brainstorming mode: whether code-intent was detected
  isPinned?: boolean;      // Pin to top of sidebar
  uploadedDocuments?: UploadedDocument[];  // session-scoped only, not persisted
}

// ── Continuation generation ──
export interface ContinuationGeneration {
  index: number;           // 1, 2, 3…
  parentIndex: number | null;  // null = child of root session; n = child of continuation n
  modeId: string;
  modeName: string;
  input: string;
  synthesisPrefixContent: string;   // truncated previous synthesis for API context
  frameworkOutputs: FrameworkOutput[];
  synthesisOutput: FrameworkOutput;
  status: 'input' | 'executing' | 'complete';
  references?: import('./references').NodeReference[];
  webSearchEnabled?: boolean;
}

// ── App state ──
export type AppScreen = 'auth' | 'workspace';
export type CanvasState = 'empty' | 'input' | 'active';

// ── API provider log entry ──
export type ApiProvider = 'gemini' | 'mistral' | 'codestral';

export interface ApiCallLog {
  id: string;          // unique per log line
  timestamp: number;
  provider: ApiProvider;
  model: string;
  fallback: boolean;   // true if primary was skipped
  frameworkId: string; // which framework this call served
}
