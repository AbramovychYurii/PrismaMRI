import type {
  ImportProgress,
  LoadedVolume,
  ParsedVolumeMeta,
  PreparedVolumeFor3D,
  SliceWindowLevel,
} from '@/types';
import type { ImportSource } from '@/lib/import/types';

export interface WorkerLoadRequest {
  type: 'load';
  source: ImportSource;
}

export type WorkerRequest = WorkerLoadRequest;

export interface WorkerProgressMsg {
  type: 'progress';
  progress: ImportProgress;
  percent: number;
}

/** Volume payload with the heavy buffers detached for Transferable posting. */
export interface WorkerDoneMsg {
  type: 'done';
  voxels: ArrayBuffer;
  voxelKind: 'f32' | 'i16';
  meta: ParsedVolumeMeta;
  scalarMin: number;
  scalarMax: number;
  windowLevel: SliceWindowLevel;
  formatId: LoadedVolume['formatId'];
  prepared: {
    data: ArrayBuffer;
    dims: PreparedVolumeFor3D['dims'];
    spacing: PreparedVolumeFor3D['spacing'];
    clim: PreparedVolumeFor3D['clim'];
    threshold: number;
    sourceRange: PreparedVolumeFor3D['sourceRange'];
    sourceDims: PreparedVolumeFor3D['sourceDims'];
  };
}

export interface WorkerErrorMsg {
  type: 'error';
  message: string;
}

export type WorkerResponse = WorkerProgressMsg | WorkerDoneMsg | WorkerErrorMsg;
