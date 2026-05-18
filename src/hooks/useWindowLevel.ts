import { WL_DEBOUNCE_MS } from '@/constants';
import { useVolumeStore } from '@/store/volumeStore';
import { useEffect, useRef } from 'react';

/**
 * Debounced commit of the W/L draft (disc drag) to the committed W/L that
 * drives slice recomputation. 96 ms matches the voxel-viewer cadence — fast
 * enough to feel live, slow enough to avoid recomputing every pointer frame.
 */
export function useWindowLevel(): void {
  const wlDraft = useVolumeStore((s) => s.wlDraft);
  const setWL = useVolumeStore((s) => s.setWL);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setWL({ window: wlDraft.window, level: wlDraft.level });
    }, WL_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [wlDraft, setWL]);
}
