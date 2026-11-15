import type { LoadedVolume } from '../types';
import { intensityHistogram, otsuThresholds } from './histogram';

const cache = new WeakMap<LoadedVolume, [number, number]>();

/**
 * Otsu thresholds of the volume: [air | soft] and [soft | dense]. Three classes
 * rather than two, so the first one still separates the subject from the air
 * when something very dense would pull a single split away from it. Cached per
 * volume, since every analysis asks.
 */
export function autoClasses(volume: LoadedVolume): [number, number] {
  let thresholds = cache.get(volume);
  if (!thresholds) {
    thresholds = otsuThresholds(intensityHistogram(volume));
    cache.set(volume, thresholds);
  }
  return thresholds;
}
