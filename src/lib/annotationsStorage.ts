/**
 * annotationsStorage — persists AI annotation sets in localStorage,
 * keyed by volume ID so findings from different files never bleed into each other.
 *
 * Storage format (v2):
 *   { version: 2, volumes: { [volumeId]: { savedAt, annotations[] } } }
 *
 * Design rules:
 *  • Each volume has its own slot — loading a new file never overwrites findings
 *    from a previous one.
 *  • `clear(volumeId)` removes one volume's slot; `clearAll()` wipes everything.
 *  • Storage failures (quota, disabled, SSR) are swallowed — the in-memory
 *    Zustand store is the source of truth at runtime.
 */

import type { AiAnnotation } from '@/types';

const STORAGE_KEY = 'prismamri.annotations.v2';
const SCHEMA_VERSION = 2 as const;

interface VolumeSlot {
  savedAt: string;
  annotations: AiAnnotation[];
}

interface StoredEnvelope {
  version: typeof SCHEMA_VERSION;
  volumes: Record<string, VolumeSlot>;
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readEnvelope(ls: Storage): StoredEnvelope {
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return { version: SCHEMA_VERSION, volumes: {} };
    const parsed = JSON.parse(raw) as Partial<StoredEnvelope>;
    if (parsed?.version !== SCHEMA_VERSION) return { version: SCHEMA_VERSION, volumes: {} };
    return { version: SCHEMA_VERSION, volumes: parsed.volumes ?? {} };
  } catch {
    return { version: SCHEMA_VERSION, volumes: {} };
  }
}

function writeEnvelope(ls: Storage, envelope: StoredEnvelope): void {
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Quota exceeded or other write error — ignore.
  }
}

/** Read annotations for a specific volume. Returns [] when nothing is saved. */
export function load(volumeId: string): AiAnnotation[] {
  const ls = safeLocalStorage();
  if (!ls) return [];
  const envelope = readEnvelope(ls);
  const slot = envelope.volumes[volumeId];
  if (!slot || !Array.isArray(slot.annotations)) return [];
  return slot.annotations;
}

/** Save annotations for a specific volume (overwrites that volume's slot). */
export function save(volumeId: string, annotations: AiAnnotation[]): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  const envelope = readEnvelope(ls);
  envelope.volumes[volumeId] = { savedAt: new Date().toISOString(), annotations };
  writeEnvelope(ls, envelope);
}

/** Remove findings for one volume. */
export function clear(volumeId: string): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  const envelope = readEnvelope(ls);
  delete envelope.volumes[volumeId];
  writeEnvelope(ls, envelope);
}

/** Wipe all findings for all volumes. */
export function clearAll(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
