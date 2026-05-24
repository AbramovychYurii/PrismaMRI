import { loadVolumeFromSource } from '@/lib/import/load-volume';
import { prepareVolumeFor3D } from '@/lib/volume/preview-3d';
/// <reference lib="webworker" />
import type { ImportProgress } from '@/types';
import { progressPercent } from '@/workers/volume/progress';
import { buildScalarHistogram, resolveHistogramWindowLevel } from '@/workers/volume/scalars';
import type { WorkerRequest, WorkerResponse } from '@/workers/volume/types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: WorkerResponse, transfer?: Transferable[]): void {
  ctx.postMessage(msg, transfer ?? []);
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  if (req.type !== 'load') return;

  const emit = (partial: Partial<ImportProgress>) => {
    const progress: ImportProgress = {
      stage: partial.stage ?? 'scanning',
      current: partial.current ?? 0,
      total: partial.total ?? 0,
      message: partial.message ?? '',
    };
    post({ type: 'progress', progress, percent: progressPercent(progress) });
  };

  try {
    const volume = await loadVolumeFromSource(req.source, emit);

    emit({ stage: 'preparing-3d', current: 0, total: 1, message: 'Building 3D texture…' });
    // Build histogram once — reused for smart W/L and 3D texture quantisation.
    const hist = buildScalarHistogram(volume.voxels, 1024);
    const windowLevel = resolveHistogramWindowLevel(hist);
    const prepared = prepareVolumeFor3D(volume, hist);
    emit({ stage: 'preparing-3d', current: 1, total: 1, message: 'Building 3D texture…' });

    const voxelsBuf = volume.voxels.buffer;
    const preparedBuf = prepared.data.buffer;
    const histBuf = hist.bins.buffer;

    post(
      {
        type: 'done',
        voxels: voxelsBuf as ArrayBuffer,
        voxelKind: volume.voxels instanceof Int16Array ? 'i16' : 'f32',
        meta: volume.meta,
        scalarMin: volume.scalarMin,
        scalarMax: volume.scalarMax,
        windowLevel,
        formatId: volume.formatId,
        prepared: {
          data: preparedBuf as ArrayBuffer,
          dims: prepared.dims,
          spacing: prepared.spacing,
          clim: prepared.clim,
          threshold: prepared.threshold,
          sourceRange: prepared.sourceRange,
          sourceDims: prepared.sourceDims,
        },
        histogram: {
          bins: histBuf as ArrayBuffer,
          min: hist.min,
          max: hist.max,
          count: hist.count,
        },
      },
      [voxelsBuf as ArrayBuffer, preparedBuf as ArrayBuffer, histBuf as ArrayBuffer],
    );
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : 'Failed to load volume.',
    });
  }
};
