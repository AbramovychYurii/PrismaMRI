import {
  type PlaneView,
  type SlicePlane,
  type ThreePreview,
  createThreeViewTarget,
} from '@prisma-mri/viewer-core';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useViewControls } from '../view-controls/context';
import { useViewerStore } from '../viewer';

/**
 * "Align to slice" camera placements, matching what the slice panels show.
 * World axes are DICOM LPS (+X patient left, +Y posterior, +Z superior — see
 * volume/orientation.ts), and PLANE_GEOMETRY draws the panels radiologically:
 *   coronal  "R ← → L", superior up   → seen from the front (eye −Y), up +Z
 *   sagittal "A ← → P", superior up   → seen from the patient's left (eye +X), up +Z
 *   axial    "R ← → L", anterior up   → seen from the feet (eye −Z), up −Y
 */
const PLANES: Record<SlicePlane, PlaneView> = {
  coronal: { eye: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  sagittal: { eye: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
  axial: { eye: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, -1, 0) },
};

/**
 * Hands the view controls a target for the 3-D preview, rebuilt on every
 * volume load (setVolume replaces the camera and the trackball); the
 * controller and its config stay.
 */
export function useViewControlsTarget(previewRef: React.MutableRefObject<ThreePreview | null>) {
  const controller = useViewControls();
  const prepared3D = useViewerStore((s) => s.prepared3D);

  // Runs after useThreePreview's setVolume effect (declared earlier in Stage).
  useEffect(() => {
    const preview = previewRef.current;
    const handles = prepared3D ? preview?.viewHandles() : null;
    if (!preview || !handles) {
      controller.setTarget(null);
      return;
    }
    controller.setTarget(
      createThreeViewTarget({
        ...handles,
        planes: PLANES,
        requestRender: () => preview.requestRender(),
        setFramingInset: (inset) => preview.setFramingInset(inset),
      }),
    );
    return () => controller.setTarget(null);
  }, [controller, prepared3D, previewRef]);
}
