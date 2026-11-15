import type {
  ActiveMeasurement,
  Annotation,
  LoadResult,
  RenderPreset,
  SliceWindowLevel,
  VolumeCursor,
} from '@prisma-mri/viewer-core';
import type { ViewerApi, ViewerSnapshot, ViewerStatus } from './api';
import type { ViewerLoader } from './loader';

/** What a host can listen for with `viewer.on`, and what each handler is given. */
export interface ViewerEvents {
  /**
   * A volume landed in the viewer. Runs inside the load's synchronous React
   * commit, so a host can swap screens without a frame in between.
   */
  loaded: LoadResult;
  /** A load or import failed; the message is the one the viewer shows. Not fired when it clears. */
  error: string;
  statuschange: ViewerStatus;
  cursorchange: VolumeCursor | null;
  windowlevelchange: SliceWindowLevel;
  presetchange: RenderPreset;
  annotationschange: Annotation[];
  activeannotationchange: string | null;
  measurementchange: ActiveMeasurement | null;
}

export interface ViewerEventApi {
  /**
   * Listens for an event; returns the function that stops listening. Events
   * about state fire after the change is in the snapshot, once per change, and
   * not for the viewer's own starting values. A handler that throws is logged
   * and does not stop the others or the code that caused the change.
   */
  on: <K extends keyof ViewerEvents>(
    type: K,
    handler: (payload: ViewerEvents[K]) => void,
  ) => () => void;
}

/** The snapshot field behind each event that reports state. */
const WATCHED: {
  [K in Exclude<keyof ViewerEvents, 'loaded'>]: (s: ViewerSnapshot) => ViewerEvents[K];
} = {
  error: (s) => s.error as string,
  statuschange: (s) => s.status,
  cursorchange: (s) => s.cursor,
  windowlevelchange: (s) => s.windowLevel,
  presetchange: (s) => s.renderPreset,
  annotationschange: (s) => s.annotations,
  activeannotationchange: (s) => s.activeAnnotationId,
  measurementchange: (s) => s.measurement,
};

function guarded<T>(handler: (payload: T) => void): (payload: T) => void {
  return (payload) => {
    try {
      handler(payload);
    } catch (err) {
      console.error('[viewer] event handler threw', err);
    }
  };
}

export function createViewerEvents(
  api: Pick<ViewerApi, 'subscribe'>,
  loader: Pick<ViewerLoader, 'onVolumeLoaded'>,
): ViewerEventApi {
  return {
    on(type, rawHandler) {
      const handler = guarded(rawHandler as (payload: unknown) => void);
      if (type === 'loaded') return loader.onVolumeLoaded(handler);
      const read = (WATCHED as Record<string, (s: ViewerSnapshot) => unknown>)[type];
      return api.subscribe((next, previous) => {
        const value = read(next);
        if (value === read(previous)) return;
        if (type === 'error' && value === null) return;
        handler(value);
      });
    },
  };
}
