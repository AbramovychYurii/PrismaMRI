import { ThreePreview } from '@/lib/volume/three-preview';
import { useVolumeStore } from '@/store';
import type { SlicePlane } from '@/types';
import { useEffect, useRef } from 'react';

/** Fallback plane when no panel has been clicked yet. */
const DEFAULT_PLANE: SlicePlane = 'coronal';

type PreviewRef = React.MutableRefObject<ThreePreview | null>;

/**
 * The store is declarative; ThreePreview is an imperative Three.js scene. Every
 * effect below is one edge of that bridge.
 *
 * They stay separate on purpose rather than collapsing into one: the methods
 * behind them differ by orders of magnitude in cost — `setVolume` disposes and
 * rebuilds the whole mesh, `setRenderPreset` swaps two textures, `setCursor`
 * writes a uniform. Merging effects whose triggers differ would fire the
 * expensive ones on every cheap change. What they are grouped by instead is
 * subject, so a new field has an obvious home.
 */

/** Owns the instance: builds it on mount, tears it down on unmount. */
function usePreviewInstance(canvasRef: React.RefObject<HTMLCanvasElement | null>): PreviewRef {
  const previewRef = useRef<ThreePreview | null>(null);
  const setPreviewInstance = useVolumeStore((s) => s.setPreviewInstance);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preview = new ThreePreview(canvas);
    previewRef.current = preview;
    // Expose the instance so the MCP bridge can capture it + drive markers.
    setPreviewInstance(preview);

    const ro = new ResizeObserver(() => preview.resize());
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      preview.dispose();
      previewRef.current = null;
      setPreviewInstance(null);
    };
  }, [canvasRef, setPreviewInstance]);

  return previewRef;
}

/** Everything that only means something once a volume is loaded. */
function useVolumeSync(previewRef: PreviewRef): void {
  const prepared3D = useVolumeStore((s) => s.prepared3D);
  const wlDraft = useVolumeStore((s) => s.wlDraft);
  const renderPreset = useVolumeStore((s) => s.renderPreset);

  useEffect(() => {
    if (prepared3D && previewRef.current) previewRef.current.setVolume(prepared3D);
  }, [prepared3D, previewRef]);

  // Window/Level → 3-D contrast, live off the draft (cheap uniform update).
  useEffect(() => {
    if (!prepared3D || !previewRef.current) return;
    const [lo, hi] = prepared3D.sourceRange;
    const span = hi - lo || 1;
    const low = (wlDraft.level - wlDraft.window / 2 - lo) / span;
    const high = (wlDraft.level + wlDraft.window / 2 - lo) / span;
    previewRef.current.setClim(low, high);
  }, [wlDraft, prepared3D, previewRef]);

  useEffect(() => {
    if (prepared3D && previewRef.current) previewRef.current.setRenderPreset(renderPreset);
  }, [renderPreset, prepared3D, previewRef]);
}

/** Where we are looking: crosshair, slice planes, clipping, measurement line. */
function useSceneSync(previewRef: PreviewRef): void {
  const cursor = useVolumeStore((s) => s.cursor);
  const planesMode = useVolumeStore((s) => s.toolbar.planes);
  const activePlane = useVolumeStore((s) => s.activePlane);
  const clipMode = useVolumeStore((s) => s.toolbar.clip);
  const measurement = useVolumeStore((s) => s.measurement);
  const spacing = useVolumeStore((s) => s.volume?.meta.spacing);

  useEffect(() => {
    if (cursor && previewRef.current) previewRef.current.setCursor(cursor);
  }, [cursor, previewRef]);

  // Reacts to both the mode itself and to which plane is active.
  useEffect(() => {
    previewRef.current?.setPlaneMode(planesMode, activePlane ?? DEFAULT_PLANE);
  }, [planesMode, activePlane, previewRef]);

  useEffect(() => {
    previewRef.current?.setClipMode(clipMode);
  }, [clipMode, previewRef]);

  useEffect(() => {
    previewRef.current?.setMeasurement(measurement, spacing ?? [1, 1, 1]);
  }, [measurement, spacing, previewRef]);
}

/** Severity-coded finding markers and which one is emphasised. */
function useAnnotationSync(previewRef: PreviewRef): void {
  const aiAnnotations = useVolumeStore((s) => s.aiAnnotations);
  const activeAnnotationId = useVolumeStore((s) => s.activeAnnotationId);
  const prepared3D = useVolumeStore((s) => s.prepared3D);

  // prepared3D is a trigger, not an input: a volume rebuild drops the markers,
  // so they have to be re-placed even when the list itself did not change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: prepared3D re-triggers re-placement after setVolume
  useEffect(() => {
    previewRef.current?.setAnnotations(aiAnnotations);
  }, [aiAnnotations, prepared3D, previewRef]);

  useEffect(() => {
    previewRef.current?.setActiveAnnotation(activeAnnotationId);
  }, [activeAnnotationId, previewRef]);
}

/**
 * One-shot camera actions rather than state to mirror.
 *
 * `snapSeq` is a counter the store bumps per request: the same plane can be
 * snapped to twice in a row, which a plain value would not re-trigger.
 */
function useCameraCommands(previewRef: PreviewRef): void {
  const snapSeq = useVolumeStore((s) => s.snapSeq);
  const snapPlane = useVolumeStore((s) => s.snapPlane);
  const railOpen = useVolumeStore((s) => s.toolbar.rail);

  // biome-ignore lint/correctness/useExhaustiveDependencies: snapSeq is the trigger, snapPlane is its payload
  useEffect(() => {
    if (snapSeq > 0) previewRef.current?.snapToPlane(snapPlane);
  }, [snapSeq, previewRef]);

  // Toggling the rail changes the stage width, but the new size is not laid out
  // until after this commit — hence the frame of delay before re-fitting.
  // biome-ignore lint/correctness/useExhaustiveDependencies: railOpen is the trigger, the body reads the new size from the DOM
  useEffect(() => {
    const id = requestAnimationFrame(() => previewRef.current?.resize());
    return () => cancelAnimationFrame(id);
  }, [railOpen, previewRef]);
}

/**
 * Binds a ThreePreview instance to a canvas and syncs it with the store.
 * Returns a stable ref to the live instance so callers can invoke imperative
 * methods (e.g. exportPNG) without routing through the store.
 */
export function useThreePreview(canvasRef: React.RefObject<HTMLCanvasElement | null>): PreviewRef {
  const previewRef = usePreviewInstance(canvasRef);
  useVolumeSync(previewRef);
  useSceneSync(previewRef);
  useAnnotationSync(previewRef);
  useCameraCommands(previewRef);
  return previewRef;
}
