import { useEffect, useRef } from "react";
import { ThreePreview } from "@/lib/volume/three-preview";
import { useVolumeStore } from "@/store";

/** Binds a ThreePreview instance to a canvas and syncs it with the store. */
export function useThreePreview(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
  const previewRef = useRef<ThreePreview | null>(null);
  const prepared3D = useVolumeStore((s) => s.prepared3D);
  const cursor = useVolumeStore((s) => s.cursor);
  const planesVisible = useVolumeStore((s) => s.toolbar.planes);
  const railOpen = useVolumeStore((s) => s.toolbar.rail);
  const wlDraft = useVolumeStore((s) => s.wlDraft);
  const measurement = useVolumeStore((s) => s.measurement);
  const spacing = useVolumeStore((s) => s.volume?.meta.spacing);
  const renderPreset = useVolumeStore((s) => s.renderPreset);

  // Create / destroy
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preview = new ThreePreview(canvas);
    previewRef.current = preview;

    const ro = new ResizeObserver(() => preview.resize());
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      preview.dispose();
      previewRef.current = null;
    };
  }, [canvasRef]);

  // Load volume
  useEffect(() => {
    if (prepared3D && previewRef.current) {
      previewRef.current.setVolume(prepared3D);
    }
  }, [prepared3D]);

  // Cursor
  useEffect(() => {
    if (cursor && previewRef.current) previewRef.current.setCursor(cursor);
  }, [cursor]);

  // Window/Level → 3D contrast, live off the draft (cheap uniform update)
  useEffect(() => {
    if (!prepared3D || !previewRef.current) return;
    const [lo, hi] = prepared3D.sourceRange;
    const span = hi - lo || 1;
    const low = (wlDraft.level - wlDraft.window / 2 - lo) / span;
    const high = (wlDraft.level + wlDraft.window / 2 - lo) / span;
    previewRef.current.setClim(low, high);
  }, [wlDraft, prepared3D]);

  // Planes toggle
  useEffect(() => {
    previewRef.current?.setPlanesVisible(planesVisible);
  }, [planesVisible]);

  // Measurement line
  useEffect(() => {
    previewRef.current?.setMeasurement(measurement, spacing ?? [1, 1, 1]);
  }, [measurement, spacing]);

  // Render preset — only meaningful once a volume is loaded
  useEffect(() => {
    if (prepared3D && previewRef.current) {
      previewRef.current.setRenderPreset(renderPreset);
    }
  }, [renderPreset, prepared3D]);

  // Rail toggle changes stage width — re-fit on next frame
  useEffect(() => {
    const id = requestAnimationFrame(() => previewRef.current?.resize());
    return () => cancelAnimationFrame(id);
  }, [railOpen]);
}
