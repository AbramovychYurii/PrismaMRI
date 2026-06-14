import type { StateStorage } from 'zustand/middleware';

/**
 * A `StateStorage` wrapper that coalesces rapid `setItem` calls into a single
 * trailing write.
 *
 * Why this exists: zustand's `persist` middleware serialises and writes the
 * partialised store to the backing storage **synchronously on every `set()`**.
 * Several store actions fire at pointer-frame frequency (~60 Hz) during normal
 * interaction:
 *   • `setWLDraft` — every frame of a window/level disc drag
 *   • `setMeasurementTo` — every frame of a shift-drag measurement
 *   • `setCursor` — every wheel-scrub tick
 *
 * Each of those would otherwise trigger a `JSON.stringify` + `sessionStorage`
 * write on the main thread, competing with slice extraction and the 3-D render.
 * Coalescing the writes keeps persistence off the hot path while still durably
 * capturing the latest state — we flush synchronously on `pagehide` /
 * `visibilitychange:hidden` so a reload or tab-close never loses the last value.
 *
 * Reads check the pending (not-yet-flushed) value first so a read-after-write
 * within the debounce window stays consistent.
 */
export function createThrottledStorage(backing: Storage, delayMs = 250): StateStorage {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.size === 0) return;
    for (const [key, value] of pending) {
      try {
        backing.setItem(key, value);
      } catch {
        /* quota / private-mode — drop silently, same as a raw setItem would */
      }
    }
    pending.clear();
  };

  // Durability: never let a buffered write die with the tab. `pagehide` and the
  // hidden visibility transition are the reliable "page is going away" signals
  // on modern browsers (more so than `beforeunload`, which is skipped by the
  // bfcache). Both are cheap no-ops when nothing is pending.
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  return {
    getItem: (name) => {
      if (pending.has(name)) return pending.get(name) ?? null;
      return backing.getItem(name);
    },
    setItem: (name, value) => {
      pending.set(name, value);
      if (timer === null) {
        timer = setTimeout(flush, delayMs);
      }
    },
    removeItem: (name) => {
      pending.delete(name);
      try {
        backing.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}
