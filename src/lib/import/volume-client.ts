import type { ImportSource } from '@/lib/import/types';
import type { ImportProgress, LoadedVolume, PreparedVolumeFor3D, VolumeHistogram } from '@/types';
import type { WorkerResponse } from '@/workers/volume/types';

export interface LoadResult {
  volume: LoadedVolume;
  prepared3D: PreparedVolumeFor3D;
  histogram: VolumeHistogram;
}

/**
 * Run a folder/file selection through the volume worker. Heavy parsing and
 * Uint8 quantization happen off the main thread; buffers come back as
 * Transferables (zero-copy).
 */
export function loadVolumeInWorker(
  source: ImportSource,
  onProgress: (p: ImportProgress, percent: number) => void,
  signal?: AbortSignal,
): Promise<LoadResult> {
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

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress(msg.progress, msg.percent);
        return;
      }
      if (msg.type === 'error') {
        cleanup();
        worker.terminate();
        reject(new Error(msg.message));
        return;
      }
      // done
      const volume: LoadedVolume = {
        voxels: msg.voxelKind === 'i16' ? new Int16Array(msg.voxels) : new Float32Array(msg.voxels),
        meta: msg.meta,
        scalarMin: msg.scalarMin,
        scalarMax: msg.scalarMax,
        windowLevel: msg.windowLevel,
        formatId: msg.formatId,
      };
      const prepared3D: PreparedVolumeFor3D = {
        data: new Uint8Array(msg.prepared.data),
        dims: msg.prepared.dims,
        spacing: msg.prepared.spacing,
        clim: msg.prepared.clim,
        threshold: msg.prepared.threshold,
        sourceRange: msg.prepared.sourceRange,
        sourceDims: msg.prepared.sourceDims,
      };
      const histogram: VolumeHistogram = {
        bins: new Uint32Array(msg.histogram.bins),
        min: msg.histogram.min,
        max: msg.histogram.max,
        count: msg.histogram.count,
      };
      cleanup();
      worker.terminate();
      resolve({ volume, prepared3D, histogram });
    };

    worker.onerror = (e) => {
      cleanup();
      worker.terminate();
      reject(new Error(e.message || 'Volume worker crashed.'));
    };

    worker.postMessage({ type: 'load', source } satisfies {
      type: 'load';
      source: ImportSource;
    });
  });
}
