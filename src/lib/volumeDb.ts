import type { LoadedVolume, PreparedVolumeFor3D, Vec3, VolumeHistogram } from '@/types';

const DB_NAME = 'prisma-mri';
const DB_VERSION = 1;
const STORE_NAME = 'volumes';
const CURRENT_KEY = 'current';

interface StoredRecord {
  id: string;
  timestamp: number;
  formatId: string;
  voxelType: 'float32' | 'int16';
  voxels: ArrayBuffer;
  scalarMin: number;
  scalarMax: number;
  windowLevel: { window: number; level: number };
  meta: LoadedVolume['meta'];
  histBins: ArrayBuffer;
  histMin: number;
  histMax: number;
  histCount: number;
  p3dData: ArrayBuffer;
  p3dDims: Vec3;
  p3dSpacing: Vec3;
  p3dClim: [number, number];
  p3dThreshold: number;
  p3dSourceRange: [number, number];
  p3dSourceDims: Vec3;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Copy a typed array's bytes to avoid detached-buffer issues. */
function copyBuffer(ta: {
  buffer: ArrayBufferLike;
  byteOffset: number;
  byteLength: number;
}): ArrayBuffer {
  return ta.buffer.slice(ta.byteOffset, ta.byteOffset + ta.byteLength) as ArrayBuffer;
}

export async function saveVolume(
  volume: LoadedVolume,
  prepared3D: PreparedVolumeFor3D,
  histogram: VolumeHistogram,
): Promise<void> {
  const db = await openDb();
  const record: StoredRecord = {
    id: CURRENT_KEY,
    timestamp: Date.now(),
    formatId: volume.formatId,
    voxelType: volume.voxels instanceof Float32Array ? 'float32' : 'int16',
    voxels: copyBuffer(volume.voxels),
    scalarMin: volume.scalarMin,
    scalarMax: volume.scalarMax,
    windowLevel: volume.windowLevel,
    meta: volume.meta,
    histBins: copyBuffer(histogram.bins),
    histMin: histogram.min,
    histMax: histogram.max,
    histCount: histogram.count,
    p3dData: copyBuffer(prepared3D.data),
    p3dDims: prepared3D.dims,
    p3dSpacing: prepared3D.spacing,
    p3dClim: prepared3D.clim,
    p3dThreshold: prepared3D.threshold,
    p3dSourceRange: prepared3D.sourceRange,
    p3dSourceDims: prepared3D.sourceDims,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.objectStore(STORE_NAME).put(record);
  });
}

export async function loadVolume(): Promise<{
  volume: LoadedVolume;
  prepared3D: PreparedVolumeFor3D;
  histogram: VolumeHistogram;
} | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(CURRENT_KEY);
    req.onsuccess = () => {
      db.close();
      const r = req.result as StoredRecord | undefined;
      if (!r) return resolve(null);

      const voxels =
        r.voxelType === 'float32' ? new Float32Array(r.voxels) : new Int16Array(r.voxels);

      resolve({
        volume: {
          voxels,
          meta: r.meta,
          scalarMin: r.scalarMin,
          scalarMax: r.scalarMax,
          windowLevel: r.windowLevel,
          formatId: r.formatId as LoadedVolume['formatId'],
        },
        prepared3D: {
          data: new Uint8Array(r.p3dData),
          dims: r.p3dDims,
          spacing: r.p3dSpacing,
          clim: r.p3dClim,
          threshold: r.p3dThreshold,
          sourceRange: r.p3dSourceRange,
          sourceDims: r.p3dSourceDims,
        },
        histogram: {
          bins: new Uint32Array(r.histBins),
          min: r.histMin,
          max: r.histMax,
          count: r.histCount,
        },
      });
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function clearVolume(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.objectStore(STORE_NAME).delete(CURRENT_KEY);
  });
}
