// ── Color accent map ──
export type AccentColor =
  | '#EF4444'  // red
  | '#F97316'  // orange
  | '#3B82F6'  // blue
  | '#8B5CF6'  // violet
  | '#F59E0B'  // amber
  | '#10B981'  // emerald
  | '#0EA5E9'; // sky

// ── Framework definition ──
export interface Framework {
  id: string;
  label: string;
  title: string;
  accent: AccentColor;
  systemPrompt: string;
  userPromptTemplate: string;
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
}

// ── App state ──
export type AppScreen = 'auth' | 'workspace';
export type CanvasState = 'empty' | 'input' | 'active';
