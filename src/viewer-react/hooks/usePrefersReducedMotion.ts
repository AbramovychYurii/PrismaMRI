import { useEffect, useState } from 'react';

const REDUCED_MOTION_MQ = '(prefers-reduced-motion: reduce)';

/** Reactively returns true when the user has requested reduced motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(REDUCED_MOTION_MQ);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}
