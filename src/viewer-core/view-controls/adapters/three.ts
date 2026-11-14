/**
 * ViewControlsTarget for a Three.js viewer.
 *
 * Rotation turns the volume object (not the camera) around axes aligned with
 * the screen, so it works with any camera controls — OrbitControls cannot
 * roll, so rotating the camera would break roll. `model` must pivot at the
 * volume centre: wrap the volume in a centred group if its origin is a corner.
 *
 * `planes` says where the camera sits for each "align to slice" view. The
 * defaults assume DICOM LPS world axes (+X patient left, +Y posterior,
 * +Z superior) and radiological slice panels: coronal "R ← → L" seen from
 * the front, sagittal "A ← → P" seen from the patient's left, axial
 * "R ← → L" seen from the feet with anterior up.
 */
import {
  Box3,
  Euler,
  MathUtils,
  type Object3D,
  type OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Sphere,
  Vector3,
} from 'three';
import type { SlicePlane } from '../../types';
import type { RotationAxis } from '../actions';
import type { FramingInset, ViewControlsTarget, ViewState } from '../target';

export interface OrbitLikeControls {
  target: Vector3;
  update(): void;
  addEventListener?(type: 'change', listener: () => void): void;
  removeEventListener?(type: 'change', listener: () => void): void;
}

export interface PlaneView {
  /** Direction from the volume centre towards the eye, in world space. */
  eye: Vector3;
  /** Screen-up direction, in world space. */
  up: Vector3;
}

export interface ThreeViewTargetOptions {
  camera: PerspectiveCamera | OrthographicCamera;
  /** The volume root, pivoting at the volume centre. */
  model: Object3D;
  controls?: OrbitLikeControls;
  /** Called after every change, for render-on-demand loops. */
  requestRender?: () => void;
  planes?: Partial<Record<SlicePlane, PlaneView>>;
  /** Fit padding, 1.1 = 10 % margin. */
  fitPadding?: number;
  /** Zoom limits relative to the view the target was created with. */
  minZoom?: number;
  maxZoom?: number;
  /** Passed through as the target's `setFramingInset`. */
  setFramingInset?: (inset: FramingInset) => void;
}

export const LPS_PLANES: Readonly<Record<SlicePlane, PlaneView>> = {
  coronal: { eye: new Vector3(0, -1, 0), up: new Vector3(0, 0, 1) },
  sagittal: { eye: new Vector3(1, 0, 0), up: new Vector3(0, 0, 1) },
  axial: { eye: new Vector3(0, 0, -1), up: new Vector3(0, -1, 0) },
};

/**
 * Sign per axis so that pitch up lifts the front, yaw right turns the front
 * right and roll clockwise turns the model clockwise as seen on screen.
 */
const SIGN: Record<RotationAxis, number> = { pitch: -1, yaw: 1, roll: -1 };

/** Camera-space column per axis: right, up, back. */
const COLUMN: Record<RotationAxis, number> = { pitch: 0, yaw: 1, roll: 2 };

/** Rounds away float dust so a readout never shows "−0°". */
const tidy = (deg: number) => (Math.abs(deg) < 0.05 ? 0 : deg);

export function createThreeViewTarget(opts: ThreeViewTargetOptions): ViewControlsTarget {
  const { camera, model, controls } = opts;
  const planes = { ...LPS_PLANES, ...opts.planes };
  const padding = opts.fitPadding ?? 1.1;
  const minZoom = opts.minZoom ?? 0.1;
  const maxZoom = opts.maxZoom ?? 40;
  const listeners = new Set<() => void>();

  const pivot = () => controls?.target ?? new Vector3();
  const home = {
    position: camera.position.clone(),
    up: camera.up.clone(),
    target: pivot().clone(),
    zoom: camera.zoom,
    distance: camera.position.distanceTo(pivot()),
    modelQuaternion: model.quaternion.clone(),
  };

  const changed = () => {
    camera.updateMatrixWorld();
    controls?.update();
    opts.requestRender?.();
    for (const l of listeners) l();
  };

  const screenAxis = (axis: RotationAxis): Vector3 => {
    camera.updateMatrixWorld();
    return new Vector3().setFromMatrixColumn(camera.matrixWorld, COLUMN[axis]).normalize();
  };

  const resetModel = () => {
    model.quaternion.copy(home.modelQuaternion);
    model.updateMatrixWorld();
  };

  const fit = () => {
    const sphere = new Box3().setFromObject(model).getBoundingSphere(new Sphere());
    const dir = camera.position.clone().sub(pivot()).normalize();
    if (controls) controls.target.copy(sphere.center);
    if (camera instanceof PerspectiveCamera) {
      const halfFov = MathUtils.degToRad(camera.fov / 2);
      const halfFovX = Math.atan(Math.tan(halfFov) * camera.aspect);
      const dist = (sphere.radius * padding) / Math.sin(Math.min(halfFov, halfFovX));
      camera.position.copy(sphere.center).addScaledVector(dir, dist);
    } else {
      const w = camera.right - camera.left;
      const h = camera.top - camera.bottom;
      camera.zoom = Math.min(w, h) / (2 * sphere.radius * padding);
      camera.updateProjectionMatrix();
      camera.position.copy(sphere.center).addScaledVector(dir, home.distance);
    }
    camera.lookAt(sphere.center);
  };

  return {
    rotate(axis, degrees) {
      const angle = SIGN[axis] * MathUtils.degToRad(degrees);
      model.quaternion.premultiply(new Quaternion().setFromAxisAngle(screenAxis(axis), angle));
      model.updateMatrixWorld();
      changed();
    },
    alignToPlane(plane) {
      const view = planes[plane];
      resetModel();
      const center = pivot().clone();
      const dist = camera.position.distanceTo(center);
      camera.up.copy(view.up);
      camera.position.copy(center).addScaledVector(view.eye.clone().normalize(), dist);
      camera.lookAt(center);
      changed();
    },
    zoomBy(factor) {
      if (camera instanceof PerspectiveCamera) {
        const target = pivot();
        const offset = camera.position.clone().sub(target);
        const next = MathUtils.clamp(
          offset.length() / factor,
          home.distance / maxZoom,
          home.distance / minZoom,
        );
        camera.position.copy(target).addScaledVector(offset.normalize(), next);
      } else {
        camera.zoom = MathUtils.clamp(
          camera.zoom * factor,
          home.zoom * minZoom,
          home.zoom * maxZoom,
        );
        camera.updateProjectionMatrix();
      }
      changed();
    },
    fitToView() {
      fit();
      changed();
    },
    resetView() {
      resetModel();
      camera.position.copy(home.position);
      camera.up.copy(home.up);
      camera.zoom = home.zoom;
      camera.updateProjectionMatrix();
      if (controls) controls.target.copy(home.target);
      camera.lookAt(home.target);
      changed();
    },
    getViewState(): ViewState {
      // The model's rotation since home, expressed in the camera's frame so
      // pitch / yaw / roll read the way the buttons turn it.
      const rel = model.quaternion.clone().multiply(home.modelQuaternion.clone().invert());
      const cam = camera.quaternion;
      const inCamera = cam.clone().invert().multiply(rel).multiply(cam);
      const e = new Euler().setFromQuaternion(inCamera, 'XYZ');
      const zoom =
        camera instanceof PerspectiveCamera
          ? home.distance / Math.max(1e-6, camera.position.distanceTo(pivot()))
          : camera.zoom / home.zoom;
      return {
        pitch: tidy(SIGN.pitch * MathUtils.radToDeg(e.x)),
        yaw: tidy(SIGN.yaw * MathUtils.radToDeg(e.y)),
        roll: tidy(SIGN.roll * MathUtils.radToDeg(e.z)),
        zoom,
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      controls?.addEventListener?.('change', listener);
      return () => {
        listeners.delete(listener);
        controls?.removeEventListener?.('change', listener);
      };
    },
    setFramingInset: opts.setFramingInset,
  };
}
