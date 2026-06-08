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

    // Preparing-3D budget split: histogram ≈ 40%, Uint8 quantisation ≈ 60%.
    // Each sub-step emits chunked progress so the stage drains smoothly from
    // 88→99% instead of sitting at 88% for the whole pass.
    emit({ stage: 'preparing-3d', current: 0, total: 100, message: 'Building 3D texture…' });
    const HIST_WEIGHT = 40;
    const PREP_WEIGHT = 60;
    const hist = buildScalarHistogram(volume.voxels, 1024, undefined, (r) => {
      emit({
        stage: 'preparing-3d',
        current: Math.round(r * HIST_WEIGHT),
        total: 100,
        message: 'Building 3D texture…',
      });
    });
    const windowLevel = resolveHistogramWindowLevel(hist);
    const prepared = prepareVolumeFor3D(volume, hist, (r) => {
      emit({
        stage: 'preparing-3d',
        current: HIST_WEIGHT + Math.round(r * PREP_WEIGHT),
        total: 100,
        message: 'Building 3D texture…',
      });
    });
    emit({ stage: 'preparing-3d', current: 100, total: 100, message: 'Building 3D texture…' });

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
