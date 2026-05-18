import type { ImportSource } from '@/lib/import/types';
import type { ImportProgress, LoadedVolume, PreparedVolumeFor3D } from '@/types';
import type { WorkerResponse } from '@/workers/volume/types';

export interface LoadResult {
  volume: LoadedVolume;
  prepared3D: PreparedVolumeFor3D;
}

/**
 * Run a folder/file selection through the volume worker. Heavy parsing and
 * Uint8 quantization happen off the main thread; buffers come back as
 * Transferables (zero-copy).
 */
export function loadVolumeInWorker(
  source: ImportSource,
  onProgress: (p: ImportProgress, percent: number) => void,
): Promise<LoadResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('@/workers/volume.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress(msg.progress, msg.percent);
        return;
      }
      if (msg.type === 'error') {
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
      worker.terminate();
      resolve({ volume, prepared3D });
    };

    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Volume worker crashed.'));
    };

    worker.postMessage({ type: 'load', source } satisfies {
      type: 'load';
      source: ImportSource;
    });
  });
}
