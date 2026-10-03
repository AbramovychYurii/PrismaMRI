import type { ImportSource, SeriesChoice } from '@/lib/import/types';
import type { ImportProgress, LoadedVolume, PreparedVolumeFor3D, VolumeHistogram } from '@/types';
import type { WorkerDoneMsg, WorkerRequest, WorkerResponse } from '@/workers/volume/types';

export interface LoadResult {
  volume: LoadedVolume;
  prepared3D: PreparedVolumeFor3D;
  histogram: VolumeHistogram;
}

/**
 * Either the loaded volume, or a list of series the source contains — in which
 * case the caller picks one and re-runs the load with its `seriesKey`.
 */
export type LoadWorkerResult =
  | { kind: 'volume'; result: LoadResult }
  | { kind: 'series-choice'; series: SeriesChoice[]; source: ImportSource };

/** Re-wraps the transferred buffers of a `done` message in their typed arrays. */
function resultFromDone(msg: WorkerDoneMsg): LoadResult {
  return {
    volume: {
      voxels: msg.voxelKind === 'i16' ? new Int16Array(msg.voxels) : new Float32Array(msg.voxels),
      meta: msg.meta,
      scalarMin: msg.scalarMin,
      scalarMax: msg.scalarMax,
      windowLevel: msg.windowLevel,
      formatId: msg.formatId,
    },
    prepared3D: {
      data: new Uint8Array(msg.prepared.data),
      dims: msg.prepared.dims,
      spacing: msg.prepared.spacing,
      clim: msg.prepared.clim,
      threshold: msg.prepared.threshold,
      sourceRange: msg.prepared.sourceRange,
      sourceDims: msg.prepared.sourceDims,
      occupancy: new Uint8Array(msg.prepared.occupancy),
    },
    histogram: {
      bins: new Uint32Array(msg.histogram.bins),
      min: msg.histogram.min,
      max: msg.histogram.max,
      count: msg.histogram.count,
    },
  };
}

/**
 * Run a folder/file selection through the volume worker. Heavy parsing and
 * Uint8 quantization happen off the main thread; buffers come back as
 * Transferables (zero-copy).
 *
 * A multi-series source resolves to `{ kind: 'series-choice' }` instead of a
 * volume; re-call with `seriesKey` set to the chosen series to assemble it.
 */
export function loadVolumeInWorker(
  source: ImportSource,
  onProgress: (p: ImportProgress, percent: number) => void,
  signal?: AbortSignal,
  seriesKey?: string,
): Promise<LoadWorkerResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Load cancelled.', 'AbortError'));
      return;
    }

    const worker = new Worker(new URL('@/workers/volume.worker.ts', import.meta.url), {
      type: 'module',
    });

    const cleanup = () => signal?.removeEventListener('abort', onAbort);

    const onAbort = () => {
      worker.terminate();
      reject(new DOMException('Load cancelled.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const settle = () => {
      cleanup();
      worker.terminate();
    };

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'progress':
          onProgress(msg.progress, msg.percent);
          return;
        case 'error':
          settle();
          reject(new Error(msg.message));
          return;
        case 'series':
          settle();
          resolve({ kind: 'series-choice', series: msg.series, source: msg.source });
          return;
        case 'done':
          settle();
          resolve({ kind: 'volume', result: resultFromDone(msg) });
          return;
        default: {
          const unexpected: never = msg;
          settle();
          reject(new Error(`Unexpected volume worker message: ${JSON.stringify(unexpected)}`));
        }
      }
    };

    worker.onerror = (e) => {
      settle();
      reject(new Error(e.message || 'Volume worker crashed.'));
    };

    // A reply that cannot be deserialised would otherwise never settle the
    // promise, leaving the import screen on its progress bar for good.
    worker.onmessageerror = () => {
      settle();
      reject(new Error('Could not read the volume worker reply.'));
    };

    worker.postMessage({ type: 'load', source, seriesKey } satisfies WorkerRequest);
  });
}
