import type { ViewState } from '@prisma-mri/viewer-core';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useViewControls, useViewControlsState } from './context';

export type FormFactor = 'desktop' | 'tablet' | 'phone';
export type Motion = 'full' | 'reduced' | 'none';

export interface FormFactorOptions {
  /** At or below this width (of the viewport the controls sit in) the phone sheet is used. */
  phoneMaxWidth?: number;
}

const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

const mediaQuery = (q: string): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(q)
    : null;

function useMediaQuery(q: string): boolean {
  const [matches, setMatches] = useState(() => mediaQuery(q)?.matches ?? false);
  useEffect(() => {
    const mq = mediaQuery(q);
    if (!mq) return;
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return matches;
}

/** Width of `element`, live; the window's while the element is not there yet. */
function useElementWidth(element: HTMLElement | null): number {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  );
  useLayoutEffect(() => {
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(element);
    return () => ro.disconnect();
  }, [element]);
  return width;
}

/**
 * phone   = the viewport is at most `phoneMaxWidth` wide (any pointer);
 * tablet  = wider, on a device whose primary pointer is coarse and cannot hover;
 * desktop = everything else.
 * Decided by input capability, not by width alone. The width is the viewport's
 * the controls sit in, not the window's: a viewer in a narrow column gets the sheet.
 */
export function useFormFactor(
  element: HTMLElement | null,
  { phoneMaxWidth = 639 }: FormFactorOptions = {},
): FormFactor {
  const width = useElementWidth(element);
  const touch = useMediaQuery(TOUCH_QUERY);
  if (width <= phoneMaxWidth) return 'phone';
  return touch ? 'tablet' : 'desktop';
}

/** Whether to draw keycap hints on the buttons. */
export function useShowKeycaps(formFactor: FormFactor): boolean {
  const mode = useViewControlsState((s) => s.config.panel.keycaps);
  const keyboardSeen = useViewControlsState((s) => s.keyboardSeen);
  const enabled = useViewControlsState((s) => s.config.keyboard.enabled);
  if (!enabled || mode === 'never') return false;
  if (mode === 'always') return true;
  return formFactor === 'desktop' || keyboardSeen;
}

/** Live view state for the readout (pitch / yaw / roll / zoom), at most one update per frame. */
export function useViewReadout(): ViewState | null {
  const controller = useViewControls();
  const lastAction = useViewControlsState((s) => s.lastAction);
  const targetSeq = useViewControlsState((s) => s.targetSeq);
  const [view, setView] = useState<ViewState | null>(
    () => controller.getTarget()?.getViewState?.() ?? null,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: lastAction and targetSeq are triggers — re-read after an action, re-subscribe to a new target
  useEffect(() => {
    const target = controller.getTarget();
    if (!target?.getViewState) {
      setView(null);
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setView(target.getViewState?.() ?? null));
    };
    setView(target.getViewState());
    const unsub = target.subscribe?.(update);
    return () => {
      cancelAnimationFrame(frame);
      unsub?.();
    };
  }, [controller, lastAction, targetSeq]);
  return view;
}

/** The config's motion setting, with `auto` following prefers-reduced-motion. */
export function useMotion(): Motion {
  const mode = useViewControlsState((s) => s.config.motion);
  const prefersReduced = useMediaQuery(REDUCED_QUERY);
  if (mode === 'none') return 'none';
  if (mode === 'reduced' || prefersReduced) return 'reduced';
  return 'full';
}

/** Whole degrees with a real minus sign; never "−0°". */
export const formatAngle = (deg: number): string => {
  const r = Math.round(deg);
  return `${r === 0 ? 0 : r}°`.replace('-', '−');
};

export const formatZoom = (zoom: number): string => `${Math.round(zoom * 100)}%`;
