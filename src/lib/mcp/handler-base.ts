import type { LoadedVolume, VolumeCursor } from '@prisma-mri/viewer-core';
import type { ViewerInstance, ViewerSnapshot } from '@prisma-mri/viewer-react';

/** Free-form message body — handlers narrow individual fields as needed. */
export type HandlerMessage = Record<string, unknown> & { id: string; action: string };

export interface HandlerContext {
  msg: HandlerMessage;
  ok: (data?: unknown) => void;
  fail: (error: string) => void;
  /** The viewer the command acts on. */
  viewer: ViewerInstance;
}

export type Handler = (ctx: HandlerContext) => void | Promise<void>;

export type LoadedState = ViewerSnapshot & { volume: LoadedVolume; cursor: VolumeCursor };

/**
 * Reports "No volume loaded" and returns null unless a volume is open. The
 * viewer only ever sets a cursor alongside a volume, so both are narrowed here.
 */
export function requireLoaded(
  viewer: ViewerInstance,
  fail: (error: string) => void,
): LoadedState | null {
  const state = viewer.getSnapshot();
  if (!state.volume || !state.cursor) {
    fail('No volume loaded');
    return null;
  }
  return state as LoadedState;
}

/** `count` slice numbers spread evenly from `first` to `last`, both included. */
export function evenlySpaced(first: number, last: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    Math.round(first + (i / (count - 1)) * (last - first)),
  );
}
