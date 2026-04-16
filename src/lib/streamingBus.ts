/**
 * StreamingBus — a module-level pub/sub for streaming token content.
 * 
 * This decouples high-frequency token writes from React state entirely.
 * Components subscribe with a frameowrk ID and receive direct DOM-write
 * callbacks. Zero React re-renders during streaming.
 */

type ContentListener = (content: string) => void;

const listeners = new Map<string, Set<ContentListener>>();
const content = new Map<string, string>();

export const StreamingBus = {
  /** Write a new content chunk — calls all registered listeners */
  emit(id: string, newContent: string) {
    content.set(id, newContent);
    const fns = listeners.get(id);
    if (fns) fns.forEach((fn) => fn(newContent));
  },

  /** Get latest content for an id (used on restore/complete) */
  get(id: string): string {
    return content.get(id) ?? '';
  },

  /** Subscribe a listener — returns an unsubscribe function */
  subscribe(id: string, fn: ContentListener): () => void {
    if (!listeners.has(id)) listeners.set(id, new Set());
    listeners.get(id)!.add(fn);
    return () => {
      listeners.get(id)?.delete(fn);
    };
  },

  /** Clear all content for a session reset */
  clear() {
    listeners.clear();
    content.clear();
  },

  /** Clear content for a specific node only */
  reset(id: string) {
    content.delete(id);
    listeners.get(id)?.forEach((fn) => fn(''));
  },
};
