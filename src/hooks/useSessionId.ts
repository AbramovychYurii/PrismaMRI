/**
 * useSessionId — stable per-browser MCP relay session UUID, persisted in
 * localStorage. Returns null when VITE_RELAY_URL is not configured (the AI
 * Agent feature is disabled in that case).
 */

import { useEffect, useState } from 'react';

const RELAY_URL = import.meta.env.VITE_RELAY_URL as string | undefined;
const SESSION_KEY = 'prismamri-session-id';

export function useSessionId(): string | null {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!RELAY_URL) return;
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, id);
    }
    setSessionId(id);
  }, []);

  return sessionId;
}
