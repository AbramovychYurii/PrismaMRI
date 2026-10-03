import { downloadBlob } from '@/lib/download';
import type { ThreePreview } from '@/lib/volume/three-preview';
import { useVolumeStore } from '@/store/volumeStore';
import { useCallback, useState } from 'react';

/** Hand the file to the user: save it, or offer it to the OS share sheet. */
export type Delivery = 'download' | 'share';

/**
 * Share a file via the Web Share API, falling back to a plain download.
 * The fallback also covers the case where the OS share sheet rejects after a
 * long async encode (the page's transient activation can expire) — the user
 * still gets the file rather than nothing. A user-cancelled share (AbortError)
 * is silent and does NOT fall back.
 */
async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      // Activation lost / share unavailable — fall through to download.
    }
  }
  downloadBlob(blob, filename);
}

function deliver(blob: Blob, filename: string, title: string, how: Delivery): Promise<void> {
  if (how === 'share') return shareOrDownload(blob, filename, title);
  downloadBlob(blob, filename);
  return Promise.resolve();
}

/**
 * Exports of the 3-D view: a PNG of the current frame and a turntable video.
 * `recordPct` is the video's progress 0..1 while it records, else null.
 */
export function useStageExport(previewRef: React.MutableRefObject<ThreePreview | null>) {
  const [recordPct, setRecordPct] = useState<number | null>(null);
  const setError = useVolumeStore((s) => s.setError);

  // Shown by StageAlert; the console alone left a failed export looking like
  // a click that did nothing. Engine text stays in the console — the user gets
  // a sentence, as load errors do.
  const reportFailure = useCallback(
    (what: string, err: unknown) => {
      console.error(err);
      setError(`Failed to export the ${what}. Try again, or reload the page if it keeps failing.`);
    },
    [setError],
  );

  const exportImage = useCallback(
    (how: Delivery) => {
      previewRef.current
        ?.exportPNG()
        .then((blob) => deliver(blob, 'prismamri-3d.png', 'PrismaMRI — 3D view', how))
        .catch((err) => reportFailure('3D view', err));
    },
    [previewRef, reportFailure],
  );

  const exportVideo = useCallback(
    async (how: Delivery) => {
      const preview = previewRef.current;
      if (!preview || recordPct !== null) return;
      setRecordPct(0);
      try {
        const { blob, ext } = await preview.exportRotationVideo({
          onProgress: (t) => setRecordPct(t),
        });
        await deliver(blob, `prismamri-3d-spin.${ext}`, 'PrismaMRI — 3D spin', how);
      } catch (err) {
        reportFailure('3D spin', err);
      } finally {
        setRecordPct(null);
      }
    },
    [previewRef, recordPct, reportFailure],
  );

  return { recordPct, exportImage, exportVideo };
}
