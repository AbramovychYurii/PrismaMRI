/**
 * annotationsStorage — persists the current AI annotation set in localStorage.
 *
 * Design rules (intentional, not accidental):
 *
 *  • Only ONE annotation set lives in storage at any time. Adding to a new
 *    volume overwrites the previous set silently — we never accumulate.
 *  • Annotations are cleared from storage only when the app explicitly calls
 *    `clear()` (e.g. via the "Clear all findings" action). Reloading the page,
 *    switching volumes, or closing the tab does NOT clear them.
 *  • The payload is a forward-compatible envelope (`{ version, savedAt,
 *    annotations }`) so future fields (volume hash, AI agent run id, …) can be
 *    layered in without breaking existing saves.
 *
 * Storage failures (quota, disabled storage, SSR) are swallowed — the in-memory
 * Zustand store remains the source of truth at runtime.
 */

import type { AiAnnotation } from '@/types';

/** Storage key — single slot, fixed name. */
const STORAGE_KEY = 'prismamri.annotations.v1';

/** Schema version stored inside the payload so future migrations are possible
 *  without colliding on the storage key. */
const SCHEMA_VERSION = 1 as const;

interface StoredEnvelope {
  version: typeof SCHEMA_VERSION;
  /** ISO timestamp of the last write — useful for "saved examples" in the UI. */
  savedAt: string;
  annotations: AiAnnotation[];
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Read the persisted set. Returns [] when there's nothing saved or the stored
 *  payload is malformed / from an unknown schema version. */
export function load(): AiAnnotation[] {
  const ls = safeLocalStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredEnvelope>;
    if (parsed?.version !== SCHEMA_VERSION) return [];
    if (!Array.isArray(parsed.annotations)) return [];
    return parsed.annotations;
  } catch {
    return [];
  }
}

/** Overwrite the persisted set with the given annotations (single-slot). */
export function save(annotations: AiAnnotation[]): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    const envelope: StoredEnvelope = {
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      annotations,
    };
    ls.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Quota exceeded or other write error — ignore.
  }
}

/** Explicit clear. Use only when the user opts in (e.g. "Clear all findings"). */
export function clear(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
