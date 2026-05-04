'use client';

import { createContext, useContext, useReducer, useCallback, type ReactNode, type Dispatch } from 'react';
import { Mode, Session, FrameworkOutput, CanvasState, FrameworkStatus, ContinuationGeneration, ApiCallLog, SessionMemory, UploadedDocument } from './types';
import { MODES, SYNTHESIS_SYSTEM_PROMPT, SYNTHESIS_USER_TEMPLATE, hasCodeIntent as checkCodeIntent, CODE_INSTRUCTION, MEMORY_WRITER_SYSTEM, MEMORY_WRITER_USER_TEMPLATE, buildSessionMemoryContext } from './modes';
import { StreamingBus } from './streamingBus';
import { getApiConfig } from '@/components/ApiLogPanel';
import type { ApiConfig } from '@/components/ApiLogPanel';
import { buildReferencesBlock, type NodeReference } from '@/lib/references';

function resolveApiConfig(username: string): ApiConfig {
  if (username === 'user101') {
    return {
      primary: 'mistral',
      mistralModel: 'mistral-medium-latest',
      geminiModel: getApiConfig().geminiModel,
    };
  }
  return getApiConfig();
}

// ── User Memory helper ──────────────────────────────────────────────────────
const USER_MEMORY_KEY = 'redteam_user_memory';
export function getUserMemory(): string {
  try {
    return localStorage.getItem(USER_MEMORY_KEY) || '';
  } catch { return ''; }
}

// ── State ──
interface AppState {
  authenticated: boolean;
  username: string;
  canvasState: CanvasState;
  selectedMode: Mode | null;
  userInput: string;
  activeSession: Session | null;
  sessions: Session[];
  detailPanelOpen: boolean;
  detailPanelNodeId: string | null;
  apiLog: ApiCallLog[];
}

const initialState: AppState = {
  authenticated: false,
  username: '',
  canvasState: 'empty',
  selectedMode: null,
  userInput: '',
  activeSession: null,
  sessions: [],
  detailPanelOpen: false,
  detailPanelNodeId: null,
  apiLog: [],
};

// ── Abort controller registry ────────────────────────────────────────────────
// Tracks in-flight fetch controllers so we can abort them on demand.
// Keyed by a string tag: 'session' | 'cont-{index}'
const _abortRegistry = new Map<string, AbortController>();

function abortAll() {
  _abortRegistry.forEach((ctrl) => ctrl.abort());
  _abortRegistry.clear();
}

function makeAbortController(key: string): AbortController {
  // Cancel any existing controller for this key first
  _abortRegistry.get(key)?.abort();
  const ctrl = new AbortController();
  _abortRegistry.set(key, ctrl);
  return ctrl;
}

function clearAbortController(key: string) {
  _abortRegistry.delete(key);
}

// ── Actions ──
type Action =
  | { type: 'LOGIN'; username: string }
  | { type: 'LOGOUT' }
  | { type: 'SELECT_MODE'; mode: Mode }
  | { type: 'SET_INPUT'; input: string }
  | { type: 'START_SESSION'; session: Session }
  | { type: 'UPDATE_FRAMEWORK'; frameworkId: string; update: Partial<FrameworkOutput> }
  | { type: 'UPDATE_SYNTHESIS'; update: Partial<FrameworkOutput> }
  | { type: 'COMPLETE_SESSION' }
  | { type: 'CANCEL_SESSION' }          // aborts in-flight streams, marks frameworks as error
  | { type: 'CANCEL_CONTINUATION'; index: number }  // aborts a specific continuation
  | { type: 'OPEN_DETAIL'; nodeId: string }
  | { type: 'CLOSE_DETAIL' }
  | { type: 'NEW_SESSION' }
  | { type: 'RESTORE_SESSION'; session: Session }
  | { type: 'LOAD_SESSIONS'; sessions: Session[] }
  | { type: 'DELETE_SESSION'; sessionId: string }
  // ── Continuation actions ──
  | { type: 'ADD_CONTINUATION'; continuation: ContinuationGeneration }
  | { type: 'DELETE_CONTINUATION'; index: number }          // removes node + all descendants
  | { type: 'SUBMIT_CONTINUATION'; index: number; modeId: string; modeName: string; input: string; frameworkIds: string[]; references?: NodeReference[]; webSearchEnabled?: boolean }
  | { type: 'UPDATE_CONTINUATION_FRAMEWORK'; index: number; frameworkId: string; update: Partial<FrameworkOutput> }
  | { type: 'UPDATE_CONTINUATION_SYNTHESIS'; index: number; update: Partial<FrameworkOutput> }
  | { type: 'COMPLETE_CONTINUATION'; index: number }
  | { type: 'ADD_API_LOG'; entry: ApiCallLog }
  | { type: 'LOAD_API_LOGS'; logs: ApiCallLog[] }
  | { type: 'RESET_FRAMEWORK'; frameworkId: string }
  | { type: 'RESET_SYNTHESIS' }
  | { type: 'UPDATE_SESSION_MEMORY'; memory: SessionMemory }
  | { type: 'UPDATE_FRAMEWORK_CONTENT'; frameworkId: string; content: string }
  | { type: 'TOGGLE_PIN'; sessionId: string }
  | { type: 'UPLOAD_DOCUMENTS'; docs: UploadedDocument[] }  // add docs to active session
  | { type: 'REMOVE_DOCUMENT'; docId: string };            // remove a doc from active session

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, authenticated: true, username: action.username };
    case 'LOGOUT':
      return { ...initialState };
    case 'SELECT_MODE':
      return { ...state, selectedMode: action.mode, canvasState: 'input' };
    case 'SET_INPUT':
      return { ...state, userInput: action.input };
    case 'START_SESSION':
      return { ...state, activeSession: action.session, canvasState: 'active', userInput: '' };
    case 'UPDATE_FRAMEWORK': {
      if (!state.activeSession) return state;
      const outputs = state.activeSession.frameworkOutputs.map((fo) =>
        fo.frameworkId === action.frameworkId ? { ...fo, ...action.update } : fo
      );
      return { ...state, activeSession: { ...state.activeSession, frameworkOutputs: outputs } };
    }
    case 'RESET_FRAMEWORK': {
      if (!state.activeSession) return state;
      const outputs = state.activeSession.frameworkOutputs.map((fo) =>
        fo.frameworkId === action.frameworkId
          ? { frameworkId: fo.frameworkId, status: 'idle' as FrameworkStatus, content: '' }
          : fo
      );
      return { ...state, activeSession: { ...state.activeSession, frameworkOutputs: outputs } };
    }
    case 'RESET_SYNTHESIS': {
      if (!state.activeSession) return state;
      return {
        ...state,
        activeSession: {
          ...state.activeSession,
          synthesisOutput: { frameworkId: 'synthesis', status: 'idle' as FrameworkStatus, content: '' },
        },
      };
    }
    case 'UPDATE_SYNTHESIS': {
      if (!state.activeSession) return state;
      return {
        ...state,
        activeSession: {
          ...state.activeSession,
          synthesisOutput: { ...state.activeSession.synthesisOutput, ...action.update },
        },
      };
    }
    case 'COMPLETE_SESSION': {
      if (!state.activeSession) return state;
      const completed = { ...state.activeSession, status: 'complete' as const };
      // Strip uploadedDocuments before persistence — session-scoped only, can be many MB
      const completedForStorage = { ...completed, uploadedDocuments: undefined };
      const updatedSessions = [completedForStorage, ...state.sessions.filter(s => s.id !== completed.id)].slice(0, 20);
      try {
        localStorage.setItem('redteam-sessions', JSON.stringify(updatedSessions));
      } catch { /* silent */ }
      return { ...state, activeSession: completed, sessions: updatedSessions };
    }
    case 'CANCEL_SESSION': {
      if (!state.activeSession) return state;
      // Mark any streaming/idle frameworks as cancelled (error) so the UI updates
      abortAll();
      const cancelledOutputs = state.activeSession.frameworkOutputs.map((fo) =>
        fo.status === 'streaming' || fo.status === 'idle'
          ? { ...fo, status: 'error' as const, error: 'Cancelled', endTime: Date.now() }
          : fo
      );
      const cancelledSynth =
        state.activeSession.synthesisOutput.status === 'streaming' ||
        state.activeSession.synthesisOutput.status === 'idle'
          ? { ...state.activeSession.synthesisOutput, status: 'error' as const, error: 'Cancelled', endTime: Date.now() }
          : state.activeSession.synthesisOutput;
      const cancelledSession = {
        ...state.activeSession,
        status: 'complete' as const,
        frameworkOutputs: cancelledOutputs,
        synthesisOutput: cancelledSynth,
      };
      const completedForStorage = { ...cancelledSession, uploadedDocuments: undefined };
      const updatedSessions = [completedForStorage, ...state.sessions.filter(s => s.id !== cancelledSession.id)].slice(0, 20);
      try { localStorage.setItem('redteam-sessions', JSON.stringify(updatedSessions)); } catch { /* silent */ }
      return { ...state, activeSession: cancelledSession, sessions: updatedSessions };
    }
    case 'CANCEL_CONTINUATION': {
      if (!state.activeSession) return state;
      abortAll();
      const conts = (state.activeSession.continuations ?? []).map((c) => {
        if (c.index !== action.index) return c;
        const cancelledOutputs = c.frameworkOutputs.map((fo) =>
          fo.status === 'streaming' || fo.status === 'idle'
            ? { ...fo, status: 'error' as const, error: 'Cancelled', endTime: Date.now() }
            : fo
        );
        return { ...c, status: 'complete' as const, frameworkOutputs: cancelledOutputs };
      });
      return { ...state, activeSession: { ...state.activeSession, continuations: conts } };
    }
    case 'OPEN_DETAIL':
      return { ...state, detailPanelOpen: true, detailPanelNodeId: action.nodeId };
    case 'CLOSE_DETAIL':
      return { ...state, detailPanelOpen: false, detailPanelNodeId: null };
    case 'NEW_SESSION':
      StreamingBus.clear();
      return {
        ...state,
        canvasState: 'empty',
        selectedMode: null,
        userInput: '',
        activeSession: null,
        detailPanelOpen: false,
        detailPanelNodeId: null,
      };
    case 'RESTORE_SESSION':
      return {
        ...state,
        activeSession: action.session,
        canvasState: 'active',
        selectedMode: MODES.find((m) => m.id === action.session.modeId) || null,
        detailPanelOpen: true,
        detailPanelNodeId: 'synthesis',
      };
    case 'LOAD_SESSIONS':
      return { ...state, sessions: action.sessions };
    case 'DELETE_SESSION': {
      const updated = state.sessions.filter((s) => s.id !== action.sessionId);
      try { localStorage.setItem('redteam-sessions', JSON.stringify(updated)); } catch { /* silent */ }
      // If deleting the active session, reset to empty
      const nextActive = state.activeSession?.id === action.sessionId ? null : state.activeSession;
      return {
        ...state,
        sessions: updated,
        activeSession: nextActive,
        canvasState: nextActive ? state.canvasState : 'empty',
        selectedMode: nextActive ? state.selectedMode : null,
        detailPanelOpen: nextActive ? state.detailPanelOpen : false,
        detailPanelNodeId: nextActive ? state.detailPanelNodeId : null,
      };
    }
    case 'TOGGLE_PIN': {
      const updatedSessions = state.sessions.map(s => 
        s.id === action.sessionId ? { ...s, isPinned: !s.isPinned } : s
      );
      const updatedActive = state.activeSession?.id === action.sessionId
        ? { ...state.activeSession, isPinned: !state.activeSession.isPinned }
        : state.activeSession;
      try {
        localStorage.setItem('redteam-sessions', JSON.stringify(updatedSessions));
      } catch { /* silent */ }
      return { ...state, sessions: updatedSessions, activeSession: updatedActive };
    }
    // ── Continuation ──
    case 'ADD_CONTINUATION': {
      if (!state.activeSession) return state;
      const existing = state.activeSession.continuations || [];
      const newSession = {
        ...state.activeSession,
        continuations: [...existing, action.continuation],
      };
      // Persist immediately so navigation away doesn't lose it
      const updatedSessions = [newSession, ...state.sessions.filter(s => s.id !== newSession.id)].slice(0, 20);
      try { localStorage.setItem('redteam-sessions', JSON.stringify(updatedSessions)); } catch { /* silent */ }
      return {
        ...state,
        activeSession: newSession,
        sessions: updatedSessions,
      };
    }
    case 'DELETE_CONTINUATION': {
      if (!state.activeSession) return state;
      // Collect the target index + all descendants (recursive BFS)
      const toDelete = new Set<number>();
      const queue = [action.index];
      while (queue.length) {
        const idx = queue.shift()!;
        toDelete.add(idx);
        (state.activeSession.continuations || []).forEach((c) => {
          if (c.parentIndex === idx) queue.push(c.index);
        });
      }
      const remaining = (state.activeSession.continuations || []).filter(
        (c) => !toDelete.has(c.index)
      );
      const updatedSession = { ...state.activeSession, continuations: remaining };
      const updatedSessions = [updatedSession, ...state.sessions.filter(s => s.id !== updatedSession.id)].slice(0, 20);
      try { localStorage.setItem('redteam-sessions', JSON.stringify(updatedSessions)); } catch { /* silent */ }
      return { ...state, activeSession: updatedSession, sessions: updatedSessions };
    }
    case 'SUBMIT_CONTINUATION': {
      if (!state.activeSession) return state;
      const conts = (state.activeSession.continuations || []).map((c) => {
        if (c.index !== action.index) return c;
        // Re-initialize frameworkOutputs for the actually submitted mode
        const newOutputs: FrameworkOutput[] = action.frameworkIds.map((id) => ({
          frameworkId: id,
          status: 'idle' as FrameworkStatus,
          content: '',
        }));
        return {
          ...c,
          modeId: action.modeId,
          modeName: action.modeName,
          input: action.input,
          frameworkOutputs: newOutputs,
          synthesisOutput: { frameworkId: 'synthesis', status: 'idle' as FrameworkStatus, content: '' },
          status: 'executing' as const,
          references: action.references,
          webSearchEnabled: action.webSearchEnabled,
        };
      });
      return { ...state, activeSession: { ...state.activeSession, continuations: conts } };
    }
    case 'UPDATE_CONTINUATION_FRAMEWORK': {
      if (!state.activeSession) return state;
      const conts = (state.activeSession.continuations || []).map((c) => {
        if (c.index !== action.index) return c;
        const outputs = c.frameworkOutputs.map((fo) =>
          fo.frameworkId === action.frameworkId ? { ...fo, ...action.update } : fo
        );
        return { ...c, frameworkOutputs: outputs };
      });
      return { ...state, activeSession: { ...state.activeSession, continuations: conts } };
    }
    case 'UPDATE_CONTINUATION_SYNTHESIS': {
      if (!state.activeSession) return state;
      const conts = (state.activeSession.continuations || []).map((c) =>
        c.index === action.index
          ? { ...c, synthesisOutput: { ...c.synthesisOutput, ...action.update } }
          : c
      );
      return { ...state, activeSession: { ...state.activeSession, continuations: conts } };
    }
    case 'COMPLETE_CONTINUATION': {
      if (!state.activeSession) return state;
      const conts = (state.activeSession.continuations || []).map((c) =>
        c.index === action.index ? { ...c, status: 'complete' as const } : c
      );
      const completedSession = { ...state.activeSession, continuations: conts };
      // Persist completed continuation to localStorage
      const updatedSessions = [completedSession, ...state.sessions.filter(s => s.id !== completedSession.id)].slice(0, 20);
      try { localStorage.setItem('redteam-sessions', JSON.stringify(updatedSessions)); } catch { /* silent */ }
      return { ...state, activeSession: completedSession, sessions: updatedSessions };
    }
    case 'UPDATE_SESSION_MEMORY': {
      if (!state.activeSession) return state;
      const updatedSession = { ...state.activeSession, sessionMemory: action.memory };
      // Persist to localStorage so it survives page refresh
      const updatedSessions = [updatedSession, ...state.sessions.filter(s => s.id !== updatedSession.id)].slice(0, 20);
      try { localStorage.setItem('redteam-sessions', JSON.stringify(updatedSessions)); } catch { /* silent */ }
      return { ...state, activeSession: updatedSession, sessions: updatedSessions };
    }
    case 'UPDATE_FRAMEWORK_CONTENT': {
      if (!state.activeSession) return state;
      const outputs = state.activeSession.frameworkOutputs.map((fo) =>
        fo.frameworkId === action.frameworkId ? { ...fo, content: action.content } : fo
      );
      return { ...state, activeSession: { ...state.activeSession, frameworkOutputs: outputs } };
    }
    case 'UPLOAD_DOCUMENTS': {
      if (!state.activeSession) return state;
      const existingIds = new Set((state.activeSession.uploadedDocuments ?? []).map(d => d.id));
      const newDocs = action.docs.filter(d => !existingIds.has(d.id));
      return {
        ...state,
        activeSession: {
          ...state.activeSession,
          uploadedDocuments: [...(state.activeSession.uploadedDocuments ?? []), ...newDocs],
        },
      };
    }
    case 'REMOVE_DOCUMENT': {
      if (!state.activeSession) return state;
      return {
        ...state,
        activeSession: {
          ...state.activeSession,
          uploadedDocuments: (state.activeSession.uploadedDocuments ?? []).filter(d => d.id !== action.docId),
        },
      };
    }
    default:
      return state;
    case 'LOAD_API_LOGS':
      return { ...state, apiLog: action.logs };
    case 'ADD_API_LOG': {
      const now = Date.now();
      const validLogs = [action.entry, ...state.apiLog].filter(l => now - l.timestamp < 24 * 60 * 60 * 1000);
      try {
        localStorage.setItem('redteam-api-logs', JSON.stringify(validLogs));
      } catch { /* silent */ }
      return { 
        ...state, 
        apiLog: validLogs,
      };
    }
  }
}

// ── Build context block for API calls ───────────────────────────────────────
function buildContextBlock(
  sessionMemory: SessionMemory | undefined,
  currentInput: string,
  hasAtMentions: boolean,
  refsBlock: string,
  synthesisPrefixContent?: string,
  uploadedDocuments?: UploadedDocument[],
): string {
  const parts: string[] = [];

  // Priority 1: @-mentioned references
  if (refsBlock) {
    parts.push(`REFERENCED CONTEXT (called explicitly by the user):\n${refsBlock}`);
  }

  // Priority 1.5: Uploaded grounding documents (session-scoped)
  if (uploadedDocuments && uploadedDocuments.length > 0) {
    const docsBlock = uploadedDocuments
      .map(d => `--- Document: ${d.name} ---\n${d.content}`)
      .join('\n\n');
    parts.push(`GROUNDING DOCUMENTS (uploaded by the user — treat as primary source material, cite specific sections when relevant):\n${docsBlock}`);
  }

  // Priority 2: User memory
  const userMem = getUserMemory();
  if (userMem) {
    parts.push(`USER CONTEXT (provided by the user):\n${userMem}`);
  }

  // Priority 3: Session memory (smart excerpt)
  const sessionMemCtx = buildSessionMemoryContext(sessionMemory, currentInput, hasAtMentions);
  if (sessionMemCtx) {
    parts.push(sessionMemCtx);
  }

  // Priority 4: Previous synthesis (continuation context)
  if (synthesisPrefixContent) {
    parts.push(`PREVIOUS SYNTHESIS (from prior round):\n${synthesisPrefixContent.slice(0, 600)}`);
  }

  return parts.join('\n\n');
}

// ── Write session memory via Mistral API ────────────────────────────────────
async function writeSessionMemory(
  session: Session,
  mode: Mode,
  dispatch: Dispatch<Action>,
  username: string
) {
  const existingMemory = session.sessionMemory;
  const existingJson = existingMemory ? JSON.stringify(existingMemory) : 'none';

  const frameworkOutputsStr = mode.frameworks
    .map((f) => {
      const output = session.frameworkOutputs.find((fo) => fo.frameworkId === f.id);
      return `[${f.title}]:\n${(output?.content || '').slice(0, 300)}`;
    })
    .join('\n\n');

  // If documents were uploaded in this session, note them for memory logging
  const docsNote = session.uploadedDocuments && session.uploadedDocuments.length > 0
    ? `\nGROUNDING DOCUMENTS used in this session:\n${session.uploadedDocuments.map(d => `- ${d.name} (${Math.round(d.content.length / 1000)}k chars)`).join('\n')}`
    : '';

  const userPrompt = MEMORY_WRITER_USER_TEMPLATE
    .replace('{EXISTING_MEMORY}', existingJson)
    .replace('{MODE_NAME}', mode.name)
    .replace('{USER_INPUT}', session.input + docsNote)
    .replace('{FRAMEWORK_OUTPUTS}', frameworkOutputsStr)
    .replace('{SYNTHESIS_OUTPUT}', (session.synthesisOutput.content || '').slice(0, 400));

  try {
    const res = await fetch('/api/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt: MEMORY_WRITER_SYSTEM,
        userPrompt,
        apiConfig: {
          primary: 'mistral' as const,
          mistralModel: 'mistral-medium-2505',
          geminiModel: resolveApiConfig(username).geminiModel,
        },
        isMemoryWriter: true,
      }),
    });

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) fullContent += parsed.content;
        } catch { /* skip */ }
      }
    }

    // Parse the JSON response
    const cleanedContent = fullContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const memory: SessionMemory = JSON.parse(cleanedContent);
    memory.lastUpdatedAt = Date.now();
    
    // Enforce caps
    if (memory.establishedFacts) memory.establishedFacts = memory.establishedFacts.slice(0, 4);
    if (memory.keyInsights) memory.keyInsights = memory.keyInsights.slice(0, 4);
    if (memory.openQuestions) memory.openQuestions = memory.openQuestions.slice(0, 3);

    dispatch({ type: 'UPDATE_SESSION_MEMORY', memory });
  } catch (err) {
    console.error('[Session Memory Writer] Failed:', err);
    // Silent failure — spec says don't surface errors to the user
  }
}

// ── Codestral fill pass (Brainstorming Mode only) ─────────────────────────
async function codestralFillPass(
  session: Session,
  userInput: string,
  dispatch: Dispatch<Action>,
  username: string
) {
  const markerRegex = /\[CODESTRAL\]\s*([\s\S]*?)\s*\[\/CODESTRAL\]/g;

  for (const fo of session.frameworkOutputs) {
    if (fo.status !== 'complete' || !fo.content) continue;
    
    let content = fo.content;
    const matches: { full: string; description: string }[] = [];
    let match: RegExpExecArray | null;
    
    while ((match = markerRegex.exec(content)) !== null) {
      matches.push({ full: match[0], description: match[1].trim() });
    }
    markerRegex.lastIndex = 0;
    
    if (matches.length === 0) continue;

    for (const m of matches) {
      // Add 500ms delay between calls to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
      
      try {
        const res = await fetch('/api/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt: 'You are an expert software engineer. Write clean, complete, well-commented code. Output only the code block with a brief one-line comment at the top describing what it does. No prose, no explanation outside the code block.',
            userPrompt: `Write the code for: ${m.description}. Context: this is for a project exploring: ${userInput.slice(0, 150)}.`,
            apiConfig: {
              primary: 'mistral' as const,
              mistralModel: 'codestral-latest',
              geminiModel: resolveApiConfig(username).geminiModel,
            },
            isCodestral: true,
          }),
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No reader');

        const decoder = new TextDecoder();
        let buffer = '';
        let codeContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) codeContent += parsed.content;
            } catch { /* skip */ }
          }
        }

        // Log the Codestral call
        dispatch({
          type: 'ADD_API_LOG',
          entry: {
            id: `${Date.now()}-codestral-${fo.frameworkId}`,
            timestamp: Date.now(),
            provider: 'codestral',
            model: 'codestral-latest',
            fallback: false,
            frameworkId: fo.frameworkId,
          },
        });

        // Replace marker with actual code
        content = content.replace(m.full, codeContent);
      } catch {
        // Graceful fallback
        content = content.replace(m.full, `\`[Code generation unavailable — ${m.description}]\``);
      }
    }

    // Update the stored output with code-filled content
    dispatch({ type: 'UPDATE_FRAMEWORK_CONTENT', frameworkId: fo.frameworkId, content });
    StreamingBus.emit(fo.frameworkId, content);
  }
}

// ── SSE stream reader helper ────────────────────────────────────────────────
async function readStream(
  res: Response,
  onContent: (content: string, fullContent: string) => void,
  onProvider?: (parsed: { provider: string; model?: string; fallback?: boolean }) => void,
  onError?: (error: string) => void,
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No reader');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);

        if (parsed.provider && onProvider) {
          onProvider(parsed);
          continue;
        }

        if (parsed.error) {
          onError?.(parsed.error);
          return fullContent;
        }

        if (parsed.content) {
          fullContent += parsed.content;
          onContent(parsed.content, fullContent);
        }

        if (parsed.info) {
          fullContent += `\n\n[🛑 ${parsed.info}]`;
          onContent('', fullContent);
        }
      } catch { /* skip malformed */ }
    }
  }

  return fullContent;
}

// ── Context ──
const AppContext = createContext<{
  state: AppState;
  dispatch: Dispatch<Action>;
  executeSession: (webSearchEnabled?: boolean, pendingDocs?: UploadedDocument[]) => void;
  executeContinuation: (contIndex: number, input: string, mode: Mode, synthesisPrefixContent: string, references?: NodeReference[], webSearchEnabled?: boolean) => Promise<void>;
  rerunFramework: (frameworkId: string, contIndex?: number | null) => Promise<void>;
  cancelSession: () => void;
  cancelContinuation: (index: number) => void;
  isExecuting: boolean;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Track whether any session or continuation is currently executing
  const isExecuting =
    state.activeSession?.status === 'executing' ||
    (state.activeSession?.continuations ?? []).some((c) => c.status === 'executing');

  const cancelSession = useCallback(() => {
    dispatch({ type: 'CANCEL_SESSION' });
  }, []);

  const cancelContinuation = useCallback((index: number) => {
    dispatch({ type: 'CANCEL_CONTINUATION', index });
  }, []);

  const executeSession = useCallback(async (webSearchEnabled = false, pendingDocs: UploadedDocument[] = [], overrideInput?: string, overrideMode?: Mode) => {
    const mode = overrideMode || state.selectedMode;
    const input = overrideInput || state.userInput;
    if (!mode || !input) return;

    // Combine pre-session pending docs with any already-attached session docs
    const uploadedDocuments = [
      ...pendingDocs,
      ...(state.activeSession?.uploadedDocuments ?? []),
    ];

    // Clear bus for fresh session
    StreamingBus.clear();

    // Detect code intent for Brainstorming mode
    const isBrainstorm = mode.id === 'brainstorm';
    const codeIntent = isBrainstorm ? checkCodeIntent(input) : false;

    const sessionId = `session-${Date.now()}`;
    const frameworkOutputs: FrameworkOutput[] = mode.frameworks.map((f) => ({
      frameworkId: f.id,
      status: 'idle' as FrameworkStatus,
      content: '',
    }));

    const session: Session = {
      id: sessionId,
      modeId: mode.id,
      modeName: mode.name,
      input,
      frameworkOutputs,
      synthesisOutput: { frameworkId: 'synthesis', status: 'idle', content: '' },
      timestamp: Date.now(),
      status: 'executing',
      hasCodeIntent: codeIntent,
      // Attach documents to session (session-scoped only, stripped before localStorage persist)
      uploadedDocuments: uploadedDocuments.length > 0 ? uploadedDocuments : undefined,
    };

    dispatch({ type: 'START_SESSION', session });

    // Auto-open the detail panel to the first framework so the user sees live streaming
    // immediately without needing to click a node. For chat mode, open the chat-response node.
    if (mode.frameworks.length > 0) {
      dispatch({ type: 'OPEN_DETAIL', nodeId: mode.frameworks[0].id });
    }

    // Create a shared AbortController for this session's parallel framework fetches
    const sessionCtrl = makeAbortController('session');
    const signal = sessionCtrl.signal;

    // Build context block (first round — no session memory yet, no continuation prefix)
    const contextBlock = buildContextBlock(undefined, input, false, '', undefined, uploadedDocuments.length > 0 ? uploadedDocuments : undefined);

    // ── Fire all frameworks in parallel ──
    const promises = mode.frameworks.map(async (framework) => {
      const userPrompt = framework.userPromptTemplate.replace('{INPUT}', input);

      // Build system prompt — inject code instruction for brainstorming if needed
      let systemPrompt = framework.systemPrompt;
      if (isBrainstorm && codeIntent) {
        systemPrompt += '\n\n' + CODE_INSTRUCTION;
      }

      // Add context block as a second system message embedded in the prompt
      if (contextBlock) {
        systemPrompt += '\n\n' + contextBlock;
      }

      // STATUS-ONLY dispatch: idle → streaming (no content yet)
      dispatch({
        type: 'UPDATE_FRAMEWORK',
        frameworkId: framework.id,
        update: { status: 'idle', startTime: Date.now() },
      });

      try {
        const res = await fetch('/api/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt,
            userPrompt,
            apiConfig: resolveApiConfig(state.username),
            enableSearch: webSearchEnabled,
          }),
          signal,
        });

        if (signal.aborted) return '';

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        // STATUS dispatch: idle → streaming (connection established, content arriving)
        dispatch({
          type: 'UPDATE_FRAMEWORK',
          frameworkId: framework.id,
          update: { status: 'streaming' },
        });

        let encounteredError = false;
        const fullContent = await readStream(
          res,
          (_chunk, full) => {
            StreamingBus.emit(framework.id, full);
          },
          (providerInfo) => {
            dispatch({
              type: 'ADD_API_LOG',
              entry: {
                id: `${Date.now()}-${framework.id}`,
                timestamp: Date.now(),
                provider: providerInfo.provider as 'gemini' | 'mistral',
                model: providerInfo.model ?? providerInfo.provider,
                fallback: providerInfo.fallback ?? false,
                frameworkId: framework.id,
              },
            });
          },
          (error) => {
            encounteredError = true;
            dispatch({
              type: 'UPDATE_FRAMEWORK',
              frameworkId: framework.id,
              update: { status: 'error', error, endTime: Date.now() },
            });
          }
        );

        if (!encounteredError) {
          // STATUS dispatch: streaming → complete (one render, with final content for persistence)
          dispatch({
            type: 'UPDATE_FRAMEWORK',
            frameworkId: framework.id,
            update: { status: 'complete', content: fullContent, endTime: Date.now() },
          });
          // Publish final content so detail panel stays current
          StreamingBus.emit(framework.id, fullContent);
        }

        return fullContent;
      } catch (err) {
        dispatch({
          type: 'UPDATE_FRAMEWORK',
          frameworkId: framework.id,
          update: {
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
            endTime: Date.now(),
          },
        });
        return '';
      }
    });

    const results = await Promise.all(promises);
    clearAbortController('session');
    if (signal.aborted) return;

    // ── Synthesis ── (skip for chat mode)
    const isChat = mode.id === 'chat';
    const successfulResults = results.filter((r) => r && r.length > 0);
    if (!isChat && successfulResults.length >= Math.min(3, mode.frameworks.length)) {
      dispatch({ type: 'UPDATE_SYNTHESIS', update: { status: 'idle', startTime: Date.now() } });

      const summary = mode.frameworks
        .map((f, i) => `${f.title}: ${(results[i] || '').slice(0, 400)}`)
        .join('\n\n');

      const synthesisUserPrompt = SYNTHESIS_USER_TEMPLATE
        .replace('{INPUT}', input)
        .replace('{SUMMARY_OF_COMPLETED_ATTACKS}', summary);

      try {
        const res = await fetch('/api/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
            userPrompt: synthesisUserPrompt,
            apiConfig: resolveApiConfig(state.username),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        // STATUS dispatch: idle → streaming (connection established)
        dispatch({ type: 'UPDATE_SYNTHESIS', update: { status: 'streaming' } });

        let encounteredError = false;
        const fullContent = await readStream(
          res,
          (_chunk, full) => {
            StreamingBus.emit('synthesis', full);
          },
          undefined,
          (error) => {
            encounteredError = true;
            dispatch({
              type: 'UPDATE_SYNTHESIS',
              update: { status: 'error', error, endTime: Date.now() },
            });
          }
        );

        if (!encounteredError) {
          dispatch({
            type: 'UPDATE_SYNTHESIS',
            update: { status: 'complete', content: fullContent, endTime: Date.now() },
          });
          StreamingBus.emit('synthesis', fullContent);
        }

      } catch {
        dispatch({
          type: 'UPDATE_SYNTHESIS',
          update: { status: 'error', error: 'Synthesis failed', endTime: Date.now() },
        });
      }
    }

    // For chat mode, auto-complete synthesis so session saves cleanly
    if (isChat && results[0]) {
      dispatch({
        type: 'UPDATE_SYNTHESIS',
        update: { status: 'complete', content: results[0], endTime: Date.now() },
      });
    }

    dispatch({ type: 'COMPLETE_SESSION' });

    // ── Post-completion: Session Memory Writer ──
    // Wait 2 seconds to avoid rate limit collision, then fire memory writer
    setTimeout(async () => {
      try {
        // Re-read the latest session from state via a fresh localStorage read
        const stored = localStorage.getItem('redteam-sessions');
        if (!stored) return;
        const sessions: Session[] = JSON.parse(stored);
        const latestSession = sessions.find(s => s.id === sessionId);
        if (!latestSession) return;
        await writeSessionMemory(latestSession, mode, dispatch, state.username);
      } catch (err) {
        console.error('[Session Memory] Post-completion write failed:', err);
      }
    }, 2000);

    // ── Post-completion: Codestral fill pass (Brainstorming only) ──
    if (isBrainstorm && codeIntent) {
      setTimeout(async () => {
        try {
          const stored = localStorage.getItem('redteam-sessions');
          if (!stored) return;
          const sessions: Session[] = JSON.parse(stored);
          const latestSession = sessions.find(s => s.id === sessionId);
          if (!latestSession) return;
          await codestralFillPass(latestSession, input, dispatch, state.username);
        } catch (err) {
          console.error('[Codestral Fill] Failed:', err);
        }
      }, 1000);
    }
  }, [state.selectedMode, state.userInput, state.activeSession?.uploadedDocuments, state.username]);

  const executeContinuation = useCallback(async (
    contIndex: number,
    input: string,
    mode: Mode,
    synthesisPrefixContent: string,
    references?: NodeReference[],
    webSearchEnabled = false,
  ) => {
    // Build the references block (empty string if no refs)
    const refsBlock = references && references.length > 0
      ? buildReferencesBlock(references)
      : '';
    const hasAtMentions = (references?.length ?? 0) > 0;

    // Get session memory from active session
    const sessionMemory = state.activeSession?.sessionMemory;

    // Build the full context block
    const fullContextBlock = buildContextBlock(
      sessionMemory,
      input,
      hasAtMentions,
      refsBlock,
      synthesisPrefixContent,
      (state.activeSession?.uploadedDocuments ?? []).length > 0
        ? state.activeSession?.uploadedDocuments
        : undefined,
    );

    const contextPrefix = `CONTEXT: You are operating in a continuation session. The following is the output from a previous red team analysis of an idea. The user is now refining, redirecting, or building on that analysis. Your job is to apply your specific analytical framework to their follow-up question in light of what has already been established — do not repeat analysis that has already been done. Push further, go deeper, look at what the first round did not reach.\n\n${fullContextBlock}\n\nApply your framework to the user's continuation below, treating the above as established context.`;

    // Atomically freeze + re-init frameworkOutputs for the chosen mode
    dispatch({
      type: 'SUBMIT_CONTINUATION',
      index: contIndex,
      modeId: mode.id,
      modeName: mode.name,
      input,
      frameworkIds: mode.frameworks.map((f) => f.id),
      references,
      webSearchEnabled,
    });

    const frameworks = mode.frameworks;
    const synthBusId = `synthesis-cont-${contIndex}`;
    const isChat = mode.id === 'chat';

    // ── Fire all continuation frameworks in parallel ──
    const promises = frameworks.map(async (framework) => {
      const userPrompt = framework.userPromptTemplate.replace('{INPUT}', input);

      dispatch({
        type: 'UPDATE_CONTINUATION_FRAMEWORK',
        index: contIndex,
        frameworkId: framework.id,
        update: { status: 'idle', startTime: Date.now() },
      });

      try {
        const res = await fetch('/api/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt: contextPrefix + '\n\n' + framework.systemPrompt,
            userPrompt,
            apiConfig: resolveApiConfig(state.username),
            enableSearch: webSearchEnabled,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const busBusId = `${framework.id}-cont-${contIndex}`;

        // STATUS dispatch: idle → streaming (connection established)
        dispatch({ type: 'UPDATE_CONTINUATION_FRAMEWORK', index: contIndex, frameworkId: framework.id, update: { status: 'streaming' } });

        let encounteredError = false;
        const fullContent = await readStream(
          res,
          (_chunk, full) => {
            StreamingBus.emit(busBusId, full);
          },
          (providerInfo) => {
            dispatch({
              type: 'ADD_API_LOG',
              entry: {
                id: `${Date.now()}-cont${contIndex}-${framework.id}`,
                timestamp: Date.now(),
                provider: providerInfo.provider as 'gemini' | 'mistral',
                model: providerInfo.model ?? providerInfo.provider,
                fallback: providerInfo.fallback ?? false,
                frameworkId: `cont${contIndex}:${framework.id}`,
              },
            });
          },
          (error) => {
            encounteredError = true;
            dispatch({ type: 'UPDATE_CONTINUATION_FRAMEWORK', index: contIndex, frameworkId: framework.id, update: { status: 'error', error, endTime: Date.now() } });
          }
        );

        if (!encounteredError) {
          dispatch({ type: 'UPDATE_CONTINUATION_FRAMEWORK', index: contIndex, frameworkId: framework.id, update: { status: 'complete', content: fullContent, endTime: Date.now() } });
          StreamingBus.emit(busBusId, fullContent);
        }
        return fullContent;
      } catch (err) {
        dispatch({ type: 'UPDATE_CONTINUATION_FRAMEWORK', index: contIndex, frameworkId: framework.id, update: { status: 'error', error: err instanceof Error ? err.message : 'Unknown', endTime: Date.now() } });
        return '';
      }
    });

    const results = await Promise.all(promises);

    // ── Continuation synthesis (skip for chat mode) ──
    const successfulResults = results.filter((r) => r && r.length > 0);
    if (!isChat && successfulResults.length >= Math.min(3, frameworks.length)) {
      dispatch({ type: 'UPDATE_CONTINUATION_SYNTHESIS', index: contIndex, update: { status: 'idle', startTime: Date.now() } });

      const summary = frameworks
        .map((f, i) => `${f.title}: ${(results[i] || '').slice(0, 400)}`)
        .join('\n\n');

      const synthesisUserPrompt = SYNTHESIS_USER_TEMPLATE
        .replace('{INPUT}', input)
        .replace('{SUMMARY_OF_COMPLETED_ATTACKS}', summary);

      try {
        const res = await fetch('/api/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt: contextPrefix + '\n\n' + SYNTHESIS_SYSTEM_PROMPT,
            userPrompt: synthesisUserPrompt,
            apiConfig: resolveApiConfig(state.username),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        // STATUS dispatch: idle → streaming (connection established)
        dispatch({ type: 'UPDATE_CONTINUATION_SYNTHESIS', index: contIndex, update: { status: 'streaming' } });

        let encounteredError = false;
        const fullContent = await readStream(
          res,
          (_chunk, full) => {
            StreamingBus.emit(synthBusId, full);
          },
          undefined,
          (error) => {
            encounteredError = true;
            dispatch({ type: 'UPDATE_CONTINUATION_SYNTHESIS', index: contIndex, update: { status: 'error', error, endTime: Date.now() } });
          }
        );

        if (!encounteredError) {
          dispatch({ type: 'UPDATE_CONTINUATION_SYNTHESIS', index: contIndex, update: { status: 'complete', content: fullContent, endTime: Date.now() } });
          StreamingBus.emit(synthBusId, fullContent);
        }
      } catch {
        dispatch({ type: 'UPDATE_CONTINUATION_SYNTHESIS', index: contIndex, update: { status: 'error', error: 'Synthesis failed', endTime: Date.now() } });
      }
    }

    dispatch({ type: 'COMPLETE_CONTINUATION', index: contIndex });

    // ── Post-completion: Session Memory Writer for continuation round ──
    setTimeout(async () => {
      try {
        const stored = localStorage.getItem('redteam-sessions');
        if (!stored) return;
        const sessions: Session[] = JSON.parse(stored);
        const latestSession = sessions.find(s => s.id === state.activeSession?.id);
        if (!latestSession) return;
        // Build a virtual "session" from the continuation for the memory writer
        const contData = latestSession.continuations?.find(c => c.index === contIndex);
        if (!contData || contData.status !== 'complete') return;
        const virtualSession: Session = {
          ...latestSession,
          input: contData.input,
          frameworkOutputs: contData.frameworkOutputs,
          synthesisOutput: contData.synthesisOutput,
        };
        const contMode = MODES.find(m => m.id === contData.modeId) || mode;
        await writeSessionMemory(virtualSession, contMode, dispatch, state.username);
      } catch (err) {
        console.error('[Session Memory] Continuation write failed:', err);
      }
    }, 2000);
  }, [state.activeSession]);

  // ── Rerun a single framework, input node, or continuation input ──────────────────
  const rerunFramework = useCallback(async (frameworkId: string, contIndex: number | null = null) => {
    const session = state.activeSession;
    if (!session) return;

    if (frameworkId === 'input') {
      if (contIndex === null) {
        // Rerun root input node
        const mode = MODES.find((m) => m.id === session.modeId) || state.selectedMode;
        if (!mode) return;
        await executeSession(false, [], session.input, mode);
        return;
      } else {
        // Rerun continuation input node
        const contData = session.continuations?.find(c => c.index === contIndex);
        if (!contData) return;
        const mode = MODES.find((m) => m.id === contData.modeId) || state.selectedMode;
        if (!mode) return;
        await executeContinuation(contIndex, contData.input, mode, contData.synthesisPrefixContent, contData.references, contData.webSearchEnabled);
        return;
      }
    }

    const mode = state.selectedMode;
    if (!mode) return;

    const framework = mode.frameworks.find((f) => f.id === frameworkId);
    if (!framework) return;

    // Reset only this framework
    dispatch({ type: 'RESET_FRAMEWORK', frameworkId });
    dispatch({ type: 'RESET_SYNTHESIS' });

    const input = session.input;
    const userPrompt = framework.userPromptTemplate.replace('{INPUT}', input);

    dispatch({
      type: 'UPDATE_FRAMEWORK',
      frameworkId,
      update: { status: 'idle', startTime: Date.now() },
    });

    let newContent = '';
    try {
      const res = await fetch('/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: framework.systemPrompt, userPrompt, apiConfig: resolveApiConfig(state.username) }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      // STATUS dispatch: idle → streaming (connection established)
      dispatch({ type: 'UPDATE_FRAMEWORK', frameworkId, update: { status: 'streaming' } });

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.provider) {
              dispatch({
                type: 'ADD_API_LOG',
                entry: {
                  id: `${Date.now()}-${frameworkId}-rerun`,
                  timestamp: Date.now(),
                  provider: parsed.provider,
                  model: parsed.model ?? parsed.provider,
                  fallback: parsed.fallback ?? false,
                  frameworkId,
                },
              });
              continue;
            }
            if (parsed.error) {
              dispatch({ type: 'UPDATE_FRAMEWORK', frameworkId, update: { status: 'error', error: parsed.error, endTime: Date.now() } });
              return;
            }
            if (typeof parsed.content === 'string' && parsed.content.length > 0) {
              newContent += parsed.content;
              StreamingBus.emit(frameworkId, newContent);
            }
          } catch { /* skip malformed */ }
        }
      }

      dispatch({
        type: 'UPDATE_FRAMEWORK',
        frameworkId,
        update: { status: 'complete', content: newContent, endTime: Date.now() },
      });
      StreamingBus.emit(frameworkId, newContent);
    } catch (err) {
      dispatch({
        type: 'UPDATE_FRAMEWORK',
        frameworkId,
        update: { status: 'error', error: err instanceof Error ? err.message : 'Unknown error', endTime: Date.now() },
      });
      return;
    }

    // ── Re-synthesize using merged results: new content for this framework, existing for others ──
    const isChat = mode.id === 'chat';
    if (isChat) return;

    // Build fresh results map: if the framework just ran, use newContent; else use persisted content
    const latestSession = state.activeSession; // stale closure OK — we only need the other frameworks
    const resultsMap: Record<string, string> = {};
    for (const fo of (latestSession?.frameworkOutputs ?? [])) {
      resultsMap[fo.frameworkId] = fo.content;
    }
    resultsMap[frameworkId] = newContent; // override with freshly generated content

    const summary = mode.frameworks
      .map((f) => `${f.title}: ${(resultsMap[f.id] || '').slice(0, 400)}`)
      .join('\n\n');

    const synthesisUserPrompt = SYNTHESIS_USER_TEMPLATE
      .replace('{INPUT}', input)
      .replace('{SUMMARY_OF_COMPLETED_ATTACKS}', summary);

    dispatch({ type: 'UPDATE_SYNTHESIS', update: { status: 'idle', startTime: Date.now() } });

    try {
      const res = await fetch('/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: SYNTHESIS_SYSTEM_PROMPT, userPrompt: synthesisUserPrompt, apiConfig: resolveApiConfig(state.username) }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      // STATUS dispatch: idle → streaming (connection established)
      dispatch({ type: 'UPDATE_SYNTHESIS', update: { status: 'streaming' } });

      const decoder = new TextDecoder();
      let buffer = '';
      let synthContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) { dispatch({ type: 'UPDATE_SYNTHESIS', update: { status: 'error', error: parsed.error, endTime: Date.now() } }); return; }
            if (typeof parsed.content === 'string' && parsed.content.length > 0) {
              synthContent += parsed.content;
              StreamingBus.emit('synthesis', synthContent);
            }
          } catch { /* skip */ }
        }
      }

      dispatch({ type: 'UPDATE_SYNTHESIS', update: { status: 'complete', content: synthContent, endTime: Date.now() } });
      StreamingBus.emit('synthesis', synthContent);
    } catch {
      dispatch({ type: 'UPDATE_SYNTHESIS', update: { status: 'error', error: 'Synthesis failed', endTime: Date.now() } });
    }

    dispatch({ type: 'COMPLETE_SESSION' });
  }, [state.activeSession, state.selectedMode, executeSession, executeContinuation]);

  return (
    <AppContext.Provider value={{ state, dispatch, executeSession, executeContinuation, rerunFramework, cancelSession, cancelContinuation, isExecuting }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
