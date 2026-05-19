import { buildCamera, buildControls, frameCamera } from '@/lib/volume/three-preview/camera';
import { CursorPlanes } from '@/lib/volume/three-preview/cursor-planes';
import { MeasurementLine } from '@/lib/volume/three-preview/measurement-line';
import {
  type VolumeObject,
  buildVolumeMesh,
  disposeVolumeObject,
} from '@/lib/volume/three-preview/volume-object';
import { type RenderPreset, buildTransferFunction } from '@/lib/volume/three-preview/volume-shader';
import type {
  ActiveMeasurement,
  PlanesMode,
  PreparedVolumeFor3D,
  SlicePlane,
  VolumeCursor,
} from '@/types';
import * as THREE from 'three';
import type { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

/** Full-quality ray-march step count. */
const RAY_STEPS = 256;

export class ThreePreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private controls: TrackballControls | null = null;
  private volume: VolumeObject | null = null;
  private readonly cursorPlanes = new CursorPlanes();
  private readonly measurementLine = new MeasurementLine();
  private sceneSize = 200;
  private raf = 0;
  private disposed = false;
  private dirty = true;
  /** Native device pixel ratio (capped at 2). Used to restore after interaction. */
  private readonly nativeDpr = Math.min(window.devicePixelRatio, 2);

  // Pre-allocated scratch objects — avoid per-frame GC pressure.
  private readonly _invModel = new THREE.Matrix4();
  private readonly _camVoxel = new THREE.Vector3();
  private readonly _fwdWorld = new THREE.Vector3();
  private readonly _fwdVoxel = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.sortObjects = false;
    this.scene.add(this.measurementLine.group);
    this.camera = buildCamera(1, 256);
    this.resize();
    this.loop();
  }

  // ── Volume ─────────────────────────────────────────────────────────────────

  setVolume(prepared: PreparedVolumeFor3D): void {
    if (this.volume) {
      this.scene.remove(this.volume.mesh);
      disposeVolumeObject(this.volume);
      this.volume = null;
    }
    const vol = buildVolumeMesh(prepared, 'mip');
    this.volume = vol;
    this.scene.add(vol.mesh);

    const dims = prepared.dims;
    const [sx, sy, sz] = prepared.spacing;
    this.cursorPlanes.setDims(dims, prepared.sourceDims);

    const center = new THREE.Vector3(
      (dims[0] / 2 - 0.5) * sx,
      (dims[1] / 2 - 0.5) * sy,
      (dims[2] / 2 - 0.5) * sz,
    );
    const maxEdge = Math.max(dims[0] * sx, dims[1] * sy, dims[2] * sz);
    this.sceneSize = maxEdge;

    const rect = this.canvas.getBoundingClientRect();
    const aspect = rect.height > 0 ? rect.width / rect.height : 1;
    this.camera = buildCamera(aspect, maxEdge);
    frameCamera(this.camera, center, maxEdge);

    this.controls?.dispose();
    this.controls = buildControls(this.camera, this.canvas, center);
    this.controls.addEventListener('start', () => {
      // Render at half device-pixel ratio while dragging — same algorithm,
      // just fewer pixels, so the look doesn't change at all.
      this.renderer.setPixelRatio(Math.max(0.75, this.nativeDpr * 0.5));
      this.resize();
      this.dirty = true;
    });
    this.controls.addEventListener('change', () => {
      this.dirty = true;
    });
    this.controls.addEventListener('end', () => {
      // Restore full resolution once the drag is released
      this.renderer.setPixelRatio(this.nativeDpr);
      this.resize();
      this.dirty = true;
    });

    this.dirty = true;
    this.resize();
  }

  // ── Preset + shading ───────────────────────────────────────────────────────

  setRenderPreset(preset: RenderPreset): void {
    const m = this.volume?.material;
    if (!m) return;

    // Swap the colormap texture
    const oldColormap = this.volume!.colormap;
    const newColormap = buildTransferFunction(preset);
    m.uniforms.u_cmdata.value = newColormap;
    this.volume!.colormap = newColormap;
    oldColormap.dispose();

    // Mode: MIP vs DVR
    m.uniforms.u_mode.value = preset === 'mip' ? 1 : 0;

    // Phong shading always on for DVR presets, irrelevant for MIP
    m.uniforms.u_shading.value = preset !== 'mip' ? 1 : 0;

    m.uniforms.u_steps.value = RAY_STEPS;

    this.dirty = true;
  }

  // ── Cursor / clim / measurement / planes ──────────────────────────────────

  setCursor(cursor: VolumeCursor): void {
    this.cursorPlanes.update(cursor);
    // Sync shader plane position (texture voxel space)
    const m = this.volume?.material;
    if (m) {
      const [px, py, pz] = this.cursorPlanes.mapCursor(cursor);
      m.uniforms.u_planePos.value.set(px, py, pz);
    }
    this.dirty = true;
  }

  /**
   * Window/Level → raycast contrast.
   * `low`/`high` are normalised 0..1 in the texture's quantisation space.
   */
  setClim(low: number, high: number): void {
    const m = this.volume?.material;
    if (!m) return;
    const lo = Math.min(low, high);
    const hi = Math.max(low, high);
    m.uniforms.u_clim.value.set(
      Math.max(0, Math.min(1, lo)),
      Math.max(0, Math.min(1, hi === lo ? lo + 0.001 : hi)),
    );
    this.dirty = true;
  }

  setMeasurement(m: ActiveMeasurement | null, spacing: [number, number, number]): void {
    if (!m) {
      this.measurementLine.clear();
      this.dirty = true;
      return;
    }
    const [sx, sy, sz] = spacing;
    const fromW = new THREE.Vector3(m.from.x * sx, m.from.y * sy, m.from.z * sz);
    if (!m.to || m.distanceMm === null) {
      this.measurementLine.setFrom(fromW, this.sceneSize);
      this.dirty = true;
      return;
    }
    const toW = new THREE.Vector3(m.to.x * sx, m.to.y * sy, m.to.z * sz);
    this.measurementLine.setBoth(fromW, toW, m.distanceMm, this.sceneSize);
    this.dirty = true;
  }

  setPlaneMode(mode: PlanesMode, activePlane: SlicePlane): void {
    this.cursorPlanes.setMode(mode, activePlane);
    const m = this.volume?.material;
    if (m) {
      m.uniforms.u_planeMode.value = mode === 'off' ? 0 : mode === 'active' ? 1 : 2;
      m.uniforms.u_activePlane.value =
        activePlane === 'coronal' ? 0 : activePlane === 'sagittal' ? 1 : 2;
    }
    this.dirty = true;
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const top = this.camera.top;
    this.camera.left = -top * aspect;
    this.camera.right = top * aspect;
    this.camera.updateProjectionMatrix();
    this.controls?.handleResize();
    this.dirty = true;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Sync camera position + ray direction into shader uniforms (voxel space). */
  private updateCameraUniform(): void {
    const vol = this.volume;
    if (!vol) return;

    // matrixWorld is only computed by three.js during renderer.render(). Force
    // an update here so the very first frame uses the correct scale matrix
    // instead of the default identity — otherwise the first render is wrong.
    vol.mesh.updateMatrixWorld(true);

    // Reuse pre-allocated scratch objects — no per-frame allocation / GC.
    this._invModel.copy(vol.mesh.matrixWorld).invert();

    // Camera position in voxel space (point transform — includes translation).
    this._camVoxel.copy(this.camera.position).applyMatrix4(this._invModel);
    vol.material.uniforms.u_camVoxel.value.copy(this._camVoxel);

    // Camera forward direction in voxel space (direction transform — no translation).
    // THREE.js camera looks down -Z in camera space; transform that to world then to voxel.
    this._fwdWorld.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    // For a pure-scale model matrix (no rotation), transformDirection = element-wise /scale.
    this._fwdVoxel.copy(this._fwdWorld).transformDirection(this._invModel).normalize();
    vol.material.uniforms.u_rayDirVox.value.copy(this._fwdVoxel);
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.controls?.update();
    if (!this.dirty) return;
    this.updateCameraUniform();
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.controls?.dispose();
    if (this.volume) disposeVolumeObject(this.volume);
    this.cursorPlanes.dispose();
    this.measurementLine.dispose();
    this.renderer.dispose();
  }
}
