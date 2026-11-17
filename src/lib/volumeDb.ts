import type {
  ImportHints,
  ImportSource,
  LoadedVolume,
  PreparedVolumeFor3D,
  SeriesChoice,
  Vec3,
  VolumeHistogram,
} from '@prisma-mri/viewer-core';
import type { ViewerSeriesContext } from '@prisma-mri/viewer-react';

const DB_NAME = 'prisma-mri';
const DB_VERSION = 1;
const STORE_NAME = 'volumes';

// IndexedDB is shared across all tabs of the same origin, so a single hard-
// coded key meant whichever tab saved most recently overwrote everyone else's
// cached volume.  Reloading any other tab would then restore the *wrong*
// volume.  We give each tab its own UUID, stored in sessionStorage:
//
//   • sessionStorage is per-tab (unlike localStorage / IndexedDB)
//   • it survives a reload — which is the exact lifetime we want here
//   • it does NOT survive closing the tab — so the cached record is naturally
//     orphaned (and pruned by `pruneOldRecords` on the next save)
//   • Chrome's "reopen closed tab" restores sessionStorage too, so restoring
//     a closed tab gets its original volume back
const TAB_ID_KEY = 'prisma-mri-tab-id';

function getTabKey(): string {
  let id = sessionStorage.getItem(TAB_ID_KEY);
  if (!id) {
    id = `tab-${crypto.randomUUID()}`;
    sessionStorage.setItem(TAB_ID_KEY, id);
  }
  return id;
}

// Orphaned-record retention.  Each closed tab leaves its record behind (no
// onclose hook can reliably delete IDB data), so we prune on every save:
// anything older than 24 h that isn't OUR tab's record is removed.  This
// also cleans up the legacy 'current' key from pre-fix installs.
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function pruneOldRecords(db: IDBDatabase, keepId: string): Promise<void> {
  const cutoff = Date.now() - ORPHAN_MAX_AGE_MS;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const rec = cursor.value as StoredRecord;
      // Always keep our own tab's records regardless of age.  Drop anything
      // else that's older than the retention window, AND drop the legacy
      // shared 'current' key (it can never be a per-tab record).
      const own = rec.id === keepId || rec.id.startsWith(`${keepId}:`);
      if (!own && (rec.id === 'current' || rec.timestamp < cutoff)) {
        cursor.delete();
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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
  /** Absent in records written before the grid moved to the worker. */
  p3dOccupancy?: ArrayBuffer;
}

/**
 * The series of a multi-series study, kept beside the volume so the series
 * selector survives a reload. Two records: the list and the open series are
 * tiny and change on every switch; the files can be large and change only with
 * the study — so a switch must not rewrite them.
 */
export interface StoredSeriesMeta {
  id: string;
  timestamp: number;
  list: SeriesChoice[];
  activeKey: string | null;
  volumeIds: Record<string, string>;
  rootName: string;
  hints?: ImportHints;
  /** Names the files record these belong to; a mismatch means they are another study's. */
  filesToken: string;
}

export interface StoredSeriesFiles {
  id: string;
  timestamp: number;
  token: string;
  files: { path: string; name: string; file: File }[];
}

const seriesMetaId = (tabKey: string) => `${tabKey}:series`;
const seriesFilesId = (tabKey: string) => `${tabKey}:series-files`;

/** A name for each study opened in this page, to tell whether its files are already stored. */
const sourceTokens = new WeakMap<ImportSource, string>();

function tokenOf(source: ImportSource): string {
  let token = sourceTokens.get(source);
  if (!token) {
    token = crypto.randomUUID();
    sourceTokens.set(source, token);
  }
  return token;
}

/** Token of the files record this tab has in the database, if any. */
let storedFilesToken: string | null = null;

/** Bytes of the files of a study — what keeping it for a reload costs. */
export function filesBytes(source: ImportSource): number {
  return source.files.reduce((sum, f) => sum + f.file.size, 0);
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

/**
 * The bytes of a typed array as an ArrayBuffer of their own, for the record.
 *
 * `put` structured-clones the record before it returns, so a view that spans
 * its whole buffer can be handed over as is — later changes to the live volume
 * cannot reach the stored copy. Slicing it first only doubled the transient
 * memory of every save (~650 MB on a full-body CT). A partial view is sliced,
 * so the record never carries bytes outside it.
 */
export function recordBuffer(ta: {
  buffer: ArrayBufferLike;
  byteOffset: number;
  byteLength: number;
}): ArrayBuffer {
  if (ta.byteOffset === 0 && ta.byteLength === ta.buffer.byteLength) {
    return ta.buffer as ArrayBuffer;
  }
  return ta.buffer.slice(ta.byteOffset, ta.byteOffset + ta.byteLength) as ArrayBuffer;
}

/**
 * Share of the origin's remaining quota this cache is willing to occupy.
 *
 * The cache only saves a page reload — the app works identically without it.
 * So it must never be the reason the browser starts evicting, which is why it
 * claims a fraction of what is free rather than whatever it can get.
 */
export const QUOTA_SHARE = 0.5;

/** Bytes the three big buffers will occupy. The metadata around them is noise. */
export function recordBytes(
  volume: LoadedVolume,
  prepared3D: PreparedVolumeFor3D,
  histogram: VolumeHistogram,
): number {
  return volume.voxels.byteLength + prepared3D.data.byteLength + histogram.bins.byteLength;
}

/**
 * Whether a record of `bytes` is worth attempting, given a StorageEstimate.
 *
 * Deliberately pure — the policy is the part worth testing, and it should not
 * need a browser to exercise. A missing or incomplete estimate returns true:
 * this is a cheap pre-flight, not the guarantee. The write itself is still
 * guarded by the QuotaExceededError path.
 */
export function fitsInQuota(bytes: number, estimate: StorageEstimate | null): boolean {
  if (!estimate || estimate.quota === undefined || estimate.usage === undefined) return true;
  return bytes <= Math.max(0, estimate.quota - estimate.usage) * QUOTA_SHARE;
}

async function readEstimate(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}

/** Runs `work` on the store in one transaction and resolves once it has committed. */
function write(db: IDBDatabase, work: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    // A quota failure aborts the transaction rather than surfacing on the
    // request, so this is the branch that actually fires when the disk is full.
    tx.onabort = () => reject(tx.error);
    work(tx.objectStore(STORE_NAME));
  });
}

function putRecord(
  db: IDBDatabase,
  record: StoredRecord | StoredSeriesMeta | StoredSeriesFiles,
): Promise<void> {
  return write(db, (store) => {
    store.put(record);
  });
}

function deleteRecords(db: IDBDatabase, ids: string[]): Promise<void> {
  return write(db, (store) => {
    for (const id of ids) store.delete(id);
  });
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
}

/**
 * Why a volume did or did not reach the cache. Reported rather than thrown:
 * running out of room is an ordinary outcome here, not a failure of the app.
 */
export type SaveOutcome =
  | { stored: true; bytes: number }
  | { stored: false; bytes: number; reason: 'too-large' | 'quota-exceeded' | 'unavailable' };

export async function saveVolume(
  volume: LoadedVolume,
  prepared3D: PreparedVolumeFor3D,
  histogram: VolumeHistogram,
): Promise<SaveOutcome> {
  const bytes = recordBytes(volume, prepared3D, histogram);

  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    // Private mode, disabled storage, corrupt database — all the same to us.
    return { stored: false, bytes, reason: 'unavailable' };
  }

  const tabKey = getTabKey();

  try {
    // Prune before measuring, not after. Records abandoned by closed tabs are
    // the likeliest reason we are short on room, so freeing them first can be
    // the difference between caching this volume and skipping it.
    try {
      await pruneOldRecords(db, tabKey);
    } catch {
      /* non-fatal — the estimate below simply sees less free space */
    }

    if (!fitsInQuota(bytes, await readEstimate())) {
      return { stored: false, bytes, reason: 'too-large' };
    }

    // Only now build the record: `put` clones it, which at full-body size is
    // ~650 MB, so paying for that before knowing there is room would be the
    // worst of both worlds — a memory spike *and* a write that fails anyway.
    const record: StoredRecord = {
      id: tabKey,
      timestamp: Date.now(),
      formatId: volume.formatId,
      voxelType: volume.voxels instanceof Float32Array ? 'float32' : 'int16',
      voxels: recordBuffer(volume.voxels),
      scalarMin: volume.scalarMin,
      scalarMax: volume.scalarMax,
      windowLevel: volume.windowLevel,
      meta: volume.meta,
      histBins: recordBuffer(histogram.bins),
      histMin: histogram.min,
      histMax: histogram.max,
      histCount: histogram.count,
      p3dData: recordBuffer(prepared3D.data),
      p3dDims: prepared3D.dims,
      p3dSpacing: prepared3D.spacing,
      p3dClim: prepared3D.clim,
      p3dThreshold: prepared3D.threshold,
      p3dSourceRange: prepared3D.sourceRange,
      p3dSourceDims: prepared3D.sourceDims,
      p3dOccupancy: prepared3D.occupancy ? recordBuffer(prepared3D.occupancy) : undefined,
    };

    await putRecord(db, record);

    return { stored: true, bytes };
  } catch (err) {
    if (isQuotaError(err)) return { stored: false, bytes, reason: 'quota-exceeded' };
    throw err;
  } finally {
    db.close();
  }
}

/**
 * The study the two series records describe, or undefined when they do not
 * describe one: either is missing, or the files belong to another study (a
 * write was interrupted between the two), or there is only one series.
 */
export function seriesFromRecords(
  meta: StoredSeriesMeta | undefined,
  files: StoredSeriesFiles | undefined,
): ViewerSeriesContext | undefined {
  if (!meta || !files || meta.filesToken !== files.token || meta.list.length <= 1) return undefined;
  return {
    source: { rootName: meta.rootName, hints: meta.hints, files: files.files },
    list: meta.list,
    activeKey: meta.activeKey,
    volumeIds: meta.volumeIds,
  };
}

export type SeriesSaveOutcome =
  | SaveOutcome
  | { stored: false; bytes: number; reason: 'single-series' };

/**
 * Keeps the series of the open study next to the cached volume. `null` (a
 * single-series volume) drops whatever an earlier study left.
 *
 * The files are written when the study changes, and only if they fit the share
 * of the free quota the volume is held to. When they do not, the volume still
 * reloads — only the other series are lost.
 */
export async function saveSeries(series: ViewerSeriesContext | null): Promise<SeriesSaveOutcome> {
  const bytes = series ? filesBytes(series.source) : 0;

  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return { stored: false, bytes, reason: 'unavailable' };
  }
  const tabKey = getTabKey();
  const staleIds = [seriesMetaId(tabKey), seriesFilesId(tabKey)];

  try {
    if (!series) {
      storedFilesToken = null;
      await deleteRecords(db, staleIds);
      return { stored: false, bytes, reason: 'single-series' };
    }

    const token = tokenOf(series.source);
    if (storedFilesToken !== token) {
      if (!fitsInQuota(bytes, await readEstimate())) {
        storedFilesToken = null;
        await deleteRecords(db, staleIds);
        return { stored: false, bytes, reason: 'too-large' };
      }
      await putRecord(db, {
        id: seriesFilesId(tabKey),
        timestamp: Date.now(),
        token,
        files: series.source.files.map(({ path, name, file }) => ({ path, name, file })),
      });
      storedFilesToken = token;
    }

    await putRecord(db, {
      id: seriesMetaId(tabKey),
      timestamp: Date.now(),
      list: series.list,
      activeKey: series.activeKey,
      volumeIds: series.volumeIds,
      rootName: series.source.rootName,
      hints: series.source.hints,
      filesToken: token,
    });
    return { stored: true, bytes };
  } catch (err) {
    if (isQuotaError(err)) {
      storedFilesToken = null;
      return { stored: false, bytes, reason: 'quota-exceeded' };
    }
    throw err;
  } finally {
    db.close();
  }
}

export async function loadVolume(): Promise<{
  volume: LoadedVolume;
  prepared3D: PreparedVolumeFor3D;
  histogram: VolumeHistogram;
  /** The study's series, when it had several and they were kept. */
  series?: ViewerSeriesContext;
} | null> {
  const db = await openDb();
  const tabKey = getTabKey();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const volumeRequest = store.get(tabKey);
    const metaRequest = store.get(seriesMetaId(tabKey));
    const filesRequest = store.get(seriesFilesId(tabKey));
    tx.oncomplete = () => {
      db.close();
      const r = volumeRequest.result as StoredRecord | undefined;
      if (!r) return resolve(null);

      const voxels =
        r.voxelType === 'float32' ? new Float32Array(r.voxels) : new Int16Array(r.voxels);

      // The files are already in the database: remember it, so the first series
      // switch after the reload does not write them again.
      const files = filesRequest.result as StoredSeriesFiles | undefined;
      const series = seriesFromRecords(metaRequest.result as StoredSeriesMeta | undefined, files);
      if (series && files) {
        sourceTokens.set(series.source, files.token);
        storedFilesToken = files.token;
      }

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
          occupancy: r.p3dOccupancy ? new Uint8Array(r.p3dOccupancy) : undefined,
        },
        histogram: {
          bins: new Uint32Array(r.histBins),
          min: r.histMin,
          max: r.histMax,
          count: r.histCount,
        },
        series,
      });
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
