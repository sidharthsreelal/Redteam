'use client';

import { createContext, useContext, useReducer, useCallback, type ReactNode, type Dispatch } from 'react';
import { Mode, Session, FrameworkOutput, CanvasState, FrameworkStatus, ContinuationGeneration, ApiCallLog } from './types';
import { MODES, SYNTHESIS_SYSTEM_PROMPT, SYNTHESIS_USER_TEMPLATE } from './modes';
import { StreamingBus } from './streamingBus';
import { getApiConfig } from '@/components/ApiLogPanel';
import { buildReferencesBlock, type NodeReference } from '@/lib/references';

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
  | { type: 'OPEN_DETAIL'; nodeId: string }
  | { type: 'CLOSE_DETAIL' }
  | { type: 'NEW_SESSION' }
  | { type: 'RESTORE_SESSION'; session: Session }
  | { type: 'LOAD_SESSIONS'; sessions: Session[] }
  | { type: 'DELETE_SESSION'; sessionId: string }
  // ── Continuation actions ──
  | { type: 'ADD_CONTINUATION'; continuation: ContinuationGeneration }
  | { type: 'DELETE_CONTINUATION'; index: number }          // removes node + all descendants
  | { type: 'SUBMIT_CONTINUATION'; index: number; modeId: string; modeName: string; input: string; frameworkIds: string[] }
  | { type: 'UPDATE_CONTINUATION_FRAMEWORK'; index: number; frameworkId: string; update: Partial<FrameworkOutput> }
  | { type: 'UPDATE_CONTINUATION_SYNTHESIS'; index: number; update: Partial<FrameworkOutput> }
  | { type: 'COMPLETE_CONTINUATION'; index: number }
  | { type: 'ADD_API_LOG'; entry: ApiCallLog };

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
      const updatedSessions = [completed, ...state.sessions.filter(s => s.id !== completed.id)].slice(0, 20);
      try {
        localStorage.setItem('redteam-sessions', JSON.stringify(updatedSessions));
      } catch { /* silent */ }
      return { ...state, activeSession: completed, sessions: updatedSessions };
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
    default:
      return state;
    case 'ADD_API_LOG':
      return { 
        ...state, 
        apiLog: [action.entry, ...state.apiLog].slice(0, 100),
      };
  }
}

// ── Context ──
const AppContext = createContext<{
  state: AppState;
  dispatch: Dispatch<Action>;
  executeSession: () => void;
  executeContinuation: (contIndex: number, input: string, mode: Mode, synthesisPrefixContent: string, references?: NodeReference[]) => Promise<void>;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const executeSession = useCallback(async () => {
    const mode = state.selectedMode;
    const input = state.userInput;
    if (!mode || !input) return;

    // Clear bus for fresh session
    StreamingBus.clear();

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
    };

    dispatch({ type: 'START_SESSION', session });

    // ── Fire all frameworks in parallel ──
    const promises = mode.frameworks.map(async (framework) => {
      const userPrompt = framework.userPromptTemplate.replace('{INPUT}', input);

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
          body: JSON.stringify({ systemPrompt: framework.systemPrompt, userPrompt, apiConfig: getApiConfig() }),
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No reader');

        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let streamingStarted = false;

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

              // Provider metadata event — log which model is serving this call
              if (parsed.provider) {
                dispatch({
                  type: 'ADD_API_LOG',
                  entry: {
                    id: `${Date.now()}-${framework.id}`,
                    timestamp: Date.now(),
                    provider: parsed.provider,
                    model: parsed.model ?? parsed.provider,
                    fallback: parsed.fallback ?? false,
                    frameworkId: framework.id,
                  },
                });
                continue;
              }

              if (parsed.error) {
                // STATUS dispatch: error
                dispatch({
                  type: 'UPDATE_FRAMEWORK',
                  frameworkId: framework.id,
                  update: { status: 'error', error: parsed.error, endTime: Date.now() },
                });
                return fullContent;
              }

              if (parsed.content) {
                fullContent += parsed.content;

                // First token: STATUS dispatch only (idle → streaming) — one render
                if (!streamingStarted) {
                  streamingStarted = true;
                  dispatch({
                    type: 'UPDATE_FRAMEWORK',
                    frameworkId: framework.id,
                    update: { status: 'streaming' },
                  });
                }

                // Content goes to bus — zero React renders
                StreamingBus.emit(framework.id, fullContent);
              }
            } catch { /* skip malformed */ }
          }
        }

        // STATUS dispatch: streaming → complete (one render, with final content for persistence)
        dispatch({
          type: 'UPDATE_FRAMEWORK',
          frameworkId: framework.id,
          update: { status: 'complete', content: fullContent, endTime: Date.now() },
        });
        // Publish final content so detail panel stays current
        StreamingBus.emit(framework.id, fullContent);

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

    // ── Synthesis ── (skip for chat mode)
    const isChat = mode.id === 'chat';
    const successfulResults = results.filter((r) => r && r.length > 0);
    if (!isChat && successfulResults.length >= Math.min(3, mode.frameworks.length)) {
      dispatch({ type: 'UPDATE_SYNTHESIS', update: { status: 'idle', startTime: Date.now() } });

      const summary = mode.frameworks
        .slice(0, 4)
        .map((f, i) => `${f.title}: ${(results[i] || '').slice(0, 180)}`)
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
            apiConfig: getApiConfig(),
          }),
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No reader');

        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let streamingStarted = false;

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

              if (parsed.error) {
                dispatch({
                  type: 'UPDATE_SYNTHESIS',
                  update: { status: 'error', error: parsed.error, endTime: Date.now() },
                });
                break;
              }

              if (parsed.content) {
                fullContent += parsed.content;

                if (!streamingStarted) {
                  streamingStarted = true;
                  dispatch({ type: 'UPDATE_SYNTHESIS', update: { status: 'streaming' } });
                }

                StreamingBus.emit('synthesis', fullContent);
              }
            } catch { /* skip */ }
          }
        }

        dispatch({
          type: 'UPDATE_SYNTHESIS',
          update: { status: 'complete', content: fullContent, endTime: Date.now() },
        });
        StreamingBus.emit('synthesis', fullContent);

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
  }, [state.selectedMode, state.userInput]);

  const executeContinuation = useCallback(async (
    contIndex: number,
    input: string,
    mode: Mode,
    synthesisPrefixContent: string,
    references?: NodeReference[]
  ) => {
    // Build the references block (empty string if no refs)
    const refsBlock = references && references.length > 0
      ? buildReferencesBlock(references) + '\n\n'
      : '';

    const contextPrefix = `CONTEXT: You are operating in a continuation session. The following is the output from a previous red team analysis of an idea. The user is now refining, redirecting, or building on that analysis. Your job is to apply your specific analytical framework to their follow-up question in light of what has already been established — do not repeat analysis that has already been done. Push further, go deeper, look at what the first round did not reach.\n\nPrevious analysis concluded:\n---\n${synthesisPrefixContent.slice(0, 600)}\n---\n\n${refsBlock}Apply your framework to the user's continuation below, treating the above as established context.`;

    // Atomically freeze + re-init frameworkOutputs for the chosen mode
    dispatch({
      type: 'SUBMIT_CONTINUATION',
      index: contIndex,
      modeId: mode.id,
      modeName: mode.name,
      input,
      frameworkIds: mode.frameworks.map((f) => f.id),
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
            apiConfig: getApiConfig(),
          }),
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No reader');

        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let started = false;
        const busBusId = `${framework.id}-cont-${contIndex}`;

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
              // Provider metadata event — log which model served this continuation call
              if (parsed.provider) {
                dispatch({
                  type: 'ADD_API_LOG',
                  entry: {
                    id: `${Date.now()}-cont${contIndex}-${framework.id}`,
                    timestamp: Date.now(),
                    provider: parsed.provider,
                    model: parsed.model ?? parsed.provider,
                    fallback: parsed.fallback ?? false,
                    frameworkId: `cont${contIndex}:${framework.id}`,
                  },
                });
                continue;
              }
              if (parsed.error) {
                dispatch({ type: 'UPDATE_CONTINUATION_FRAMEWORK', index: contIndex, frameworkId: framework.id, update: { status: 'error', error: parsed.error, endTime: Date.now() } });
                return '';
              }
              if (parsed.content) {
                fullContent += parsed.content;
                if (!started) {
                  started = true;
                  dispatch({ type: 'UPDATE_CONTINUATION_FRAMEWORK', index: contIndex, frameworkId: framework.id, update: { status: 'streaming' } });
                }
                StreamingBus.emit(busBusId, fullContent);
              }
            } catch { /* skip */ }
          }
        }

        dispatch({ type: 'UPDATE_CONTINUATION_FRAMEWORK', index: contIndex, frameworkId: framework.id, update: { status: 'complete', content: fullContent, endTime: Date.now() } });
        StreamingBus.emit(busBusId, fullContent);
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
        .slice(0, 4)
        .map((f, i) => `${f.title}: ${(results[i] || '').slice(0, 180)}`)
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
            apiConfig: getApiConfig(),
          }),
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No reader');
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let started = false;

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
              if (parsed.error) { dispatch({ type: 'UPDATE_CONTINUATION_SYNTHESIS', index: contIndex, update: { status: 'error', error: parsed.error, endTime: Date.now() } }); break; }
              if (parsed.content) {
                fullContent += parsed.content;
                if (!started) { started = true; dispatch({ type: 'UPDATE_CONTINUATION_SYNTHESIS', index: contIndex, update: { status: 'streaming' } }); }
                StreamingBus.emit(synthBusId, fullContent);
              }
            } catch { /* skip */ }
          }
        }

        dispatch({ type: 'UPDATE_CONTINUATION_SYNTHESIS', index: contIndex, update: { status: 'complete', content: fullContent, endTime: Date.now() } });
        StreamingBus.emit(synthBusId, fullContent);
      } catch {
        dispatch({ type: 'UPDATE_CONTINUATION_SYNTHESIS', index: contIndex, update: { status: 'error', error: 'Synthesis failed', endTime: Date.now() } });
      }
    }

    dispatch({ type: 'COMPLETE_CONTINUATION', index: contIndex });
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, executeSession, executeContinuation }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
