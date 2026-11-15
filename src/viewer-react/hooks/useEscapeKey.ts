import { useEffect } from 'react';
import { useViewerEnvironment } from '../viewer';

/**
 * Calls `onEscape` on Esc while `active`. Listens where the viewer's shortcuts
 * do (`keyboardTarget`) rather than on the document, so one viewer's Esc never
 * reaches another viewer on the page; with shortcuts off it listens on the
 * viewer's own element. It works for overlays that never take focus as long as
 * focus is inside the viewer, or the host chose `window`.
 *
 * Pass a stable callback — an inline arrow re-subscribes on every render.
 */
export function useEscapeKey(onEscape: () => void, active = true): void {
  const { keyboardTarget, rootElement } = useViewerEnvironment();
  const target = keyboardTarget ?? rootElement;
  useEffect(() => {
    if (!active || !target) return;
    const onKey = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') onEscape();
    };
    target.addEventListener('keydown', onKey);
    return () => target.removeEventListener('keydown', onKey);
  }, [active, target, onEscape]);
}
