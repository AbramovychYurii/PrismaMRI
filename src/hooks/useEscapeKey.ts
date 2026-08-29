import { useEffect } from 'react';

/**
 * Calls `onEscape` while mounted. Listens on the document rather than an
 * element so it works for overlays that never take focus.
 *
 * Pass a stable callback — an inline arrow re-subscribes on every render.
 */
export function useEscapeKey(onEscape: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEscape]);
}
