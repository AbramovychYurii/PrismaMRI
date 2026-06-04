import { AnnotationMarkers } from '@/lib/volume/three-preview/annotation-markers';
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
  AiAnnotation,
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
  private readonly annotationMarkers = new AnnotationMarkers();
  /** Voxel spacing of the loaded volume — for marker world placement. */
  private _spacing: readonly [number, number, number] = [1, 1, 1];
  /** Latest annotation list + active id, re-applied when a volume (re)loads. */
  private _annotations: AiAnnotation[] = [];
  private _activeAnnotationId: string | null = null;
  private sceneSize = 200;
  private raf = 0;
  private disposed = false;
  private dirty = true;
  /** Timestamp of the last renderer.render() call — used to keep the GPU warm. */
  private lastRenderAt = 0;
  /** Interval between keepalive renders when the scene is otherwise idle (ms). */
  private static readonly KEEPALIVE_MS = 8_000;
  /** Native device pixel ratio (capped at 2). Used to restore after interaction. */
  private readonly nativeDpr = Math.min(window.devicePixelRatio, 2);

  // Pre-allocated scratch objects — avoid per-frame GC pressure.
  private readonly _invModel = new THREE.Matrix4();
  private readonly _camVoxel = new THREE.Vector3();
  private readonly _fwdWorld = new THREE.Vector3();
  private readonly _fwdVoxel = new THREE.Vector3();

  // ── Snap-to-plane animation state ─────────────────────────────────────────
  private _snapActive = false;
  private _snapStartTs = 0;
  private readonly _snapFromPos = new THREE.Vector3();
  private readonly _snapToPos = new THREE.Vector3();
  private readonly _snapFromUp = new THREE.Vector3();
  private readonly _snapToUp = new THREE.Vector3();
  private readonly _snapCenter = new THREE.Vector3();
  private _snapRadius = 1;
  /** Volume center in world space — kept for snap target. */
  private readonly _volumeCenter = new THREE.Vector3();
  // Dedicated scratch objects for the snap animation (not reused elsewhere).
  private readonly _snapDirA = new THREE.Vector3();
  private readonly _snapDirB = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      // Required so ctx.drawImage / toDataURL can read the WebGL buffer
      // after renderer.render() without the content being swapped away.
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.sortObjects = false;
    this.scene.add(this.measurementLine.group);
    this.scene.add(this.annotationMarkers.group);
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
    this._volumeCenter.copy(center);
    const maxEdge = Math.max(dims[0] * sx, dims[1] * sy, dims[2] * sz);
    this.sceneSize = maxEdge;
    this._spacing = prepared.spacing;
    // Re-place any markers now that scene scale + spacing are known.
    this.annotationMarkers.setAnnotations(this._annotations, this._spacing, this.sceneSize);
    this.annotationMarkers.setActive(this._activeAnnotationId);

    const rect = this.canvas.getBoundingClientRect();
    const aspect = rect.height > 0 ? rect.width / rect.height : 1;
    this.camera = buildCamera(aspect, maxEdge);
    frameCamera(this.camera, center, maxEdge);

    this.controls?.dispose();
    this.controls = buildControls(this.camera, this.canvas, center);

    // Track whether the camera actually moved during this pointer session.
    // A plain click fires start→end with no 'change' in between — we must
    // NOT resize/downscale in that case or every click causes a visible flash.
    let didMove = false;

    this.controls.addEventListener('start', () => {
      didMove = false;
    });
    this.controls.addEventListener('change', () => {
      if (!didMove) {
        // First real camera movement: drop to half DPR for responsiveness.
        this.renderer.setPixelRatio(Math.max(0.75, this.nativeDpr * 0.5));
        this.resize();
        didMove = true;
      }
      this.dirty = true;
    });
    this.controls.addEventListener('end', () => {
      if (didMove) {
        // Restore full resolution only when we actually dragged.
        this.renderer.setPixelRatio(this.nativeDpr);
        this.resize();
      }
      didMove = false;
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

  // ── AI annotation markers ──────────────────────────────────────────────────

  setAnnotations(list: AiAnnotation[]): void {
    this._annotations = list;
    this.annotationMarkers.setAnnotations(list, this._spacing, this.sceneSize);
    this.annotationMarkers.setActive(this._activeAnnotationId);
    this.dirty = true;
  }

  setActiveAnnotation(id: string | null): void {
    this._activeAnnotationId = id;
    this.annotationMarkers.setActive(id);
    this.dirty = true;
  }

  setClipMode(enabled: boolean): void {
    const m = this.volume?.material;
    if (!m) return;
    m.uniforms.u_clipMode.value = enabled ? 1 : 0;
    if (enabled) this._snapClipDir(m);
    this.dirty = true;
  }

  /**
   * Freeze the clip direction based on the current camera position so the
   * clipped half never flips while the user orbits around the volume.
   */
  private _snapClipDir(m: THREE.ShaderMaterial): void {
    // Ensure _camVoxel reflects the current camera state before reading it.
    this.updateCameraUniform();
    const ap = m.uniforms.u_activePlane.value as number;
    const pp = m.uniforms.u_planePos.value as THREE.Vector3;
    const camA = ap === 0 ? this._camVoxel.y : ap === 1 ? this._camVoxel.x : this._camVoxel.z;
    const planA = ap === 0 ? pp.y : ap === 1 ? pp.x : pp.z;
    m.uniforms.u_clipDir.value = camA >= planA ? 1.0 : -1.0;
  }

  setPlaneMode(mode: PlanesMode, activePlane: SlicePlane): void {
    this.cursorPlanes.setMode(mode, activePlane);
    const m = this.volume?.material;
    if (m) {
      m.uniforms.u_planeMode.value = mode === 'off' ? 0 : mode === 'active' ? 1 : 2;
      m.uniforms.u_activePlane.value =
        activePlane === 'coronal' ? 0 : activePlane === 'sagittal' ? 1 : 2;
      // Re-snap clip direction for the new plane while clip mode is active.
      if (m.uniforms.u_clipMode.value === 1) this._snapClipDir(m);
    }
    this.dirty = true;
  }

  // ── Snap-to-plane ──────────────────────────────────────────────────────────

  /**
   * Smoothly animate the camera to the standard anatomical view for `plane`.
   * The camera distance (zoom) is preserved; only orientation changes.
   *
   * View conventions (matching 2-D slice panel layout):
   *   coronal  — looking along -Y, Z up   (frontal / anterior view)
   *   sagittal — looking along +X, Z up   (right lateral view)
   *   axial    — looking along +Z, -Y up  (superior / top-down view)
   */
  snapToPlane(plane: SlicePlane): void {
    if (!this.controls) return;

    const center = this.controls.target;
    const radius = this.camera.position.distanceTo(center);

    // Target camera direction (unit vector FROM center TO camera) and up vector.
    const dirMap: Record<SlicePlane, [THREE.Vector3, THREE.Vector3]> = {
      coronal: [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1)],
      sagittal: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
      axial: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)],
    };
    const [dir, up] = dirMap[plane];

    this._snapFromPos.copy(this.camera.position);
    this._snapFromUp.copy(this.camera.up);
    this._snapToPos.copy(center).addScaledVector(dir, radius);
    this._snapToUp.copy(up);
    this._snapCenter.copy(center);
    this._snapRadius = radius;
    this._snapStartTs = 0; // will be set on first animation frame
    this._snapActive = true;

    // Suspend trackball during animation so it doesn't fight us.
    this.controls.enabled = false;
    this.dirty = true;
  }

  private _easeInOut(t: number): number {
    // Cubic ease-in-out
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
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

  private loop = (ts = 0): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    // ── Snap animation ───────────────────────────────────────────────────────
    if (this._snapActive) {
      // Latch start timestamp on the first frame of this animation.
      if (this._snapStartTs === 0) this._snapStartTs = ts;

      const DURATION = 400;
      const raw = Math.min(1, (ts - this._snapStartTs) / DURATION);
      const e = this._easeInOut(raw);

      // Lerp the two direction vectors, re-normalise → great-circle interpolation,
      // no per-frame quaternion allocation needed.
      this._snapDirA.copy(this._snapFromPos).sub(this._snapCenter).normalize();
      this._snapDirB.copy(this._snapToPos).sub(this._snapCenter).normalize();
      this._snapDirA.lerpVectors(this._snapDirA, this._snapDirB, e).normalize();
      this.camera.position.copy(this._snapCenter).addScaledVector(this._snapDirA, this._snapRadius);

      // Lerp up vector and re-aim.
      this.camera.up.lerpVectors(this._snapFromUp, this._snapToUp, e).normalize();
      this.camera.lookAt(this._snapCenter);

      if (raw >= 1) {
        this._snapActive = false;
        this._snapStartTs = 0;
        // Final frame: set camera exactly at target position before handing
        // control back, so TrackballControls picks up the correct _eye vector.
        this.camera.position.copy(this._snapToPos);
        this.camera.up.copy(this._snapToUp);
        this.camera.lookAt(this._snapCenter);
        if (this.controls) {
          this.controls.enabled = true;
          this.controls.update();
        }
        // Re-snap clip direction now that the camera is at its final position.
        const m = this.volume?.material;
        if (m && m.uniforms.u_clipMode.value === 1) this._snapClipDir(m);
      }

      this.dirty = true;
    } else {
      // Only update controls when we are NOT animating — controls.update()
      // unconditionally writes camera.position = target + _eye, which would
      // override every snap animation frame.
      this.controls?.update();
    }
    if (!this.dirty) {
      // Keepalive: render to a 1×1 offscreen target when idle to keep the GPU
      // and compiled shaders warm. Uses WebGLRenderTarget so the main canvas
      // is never touched — no visible flash in the browser.
      if (this.volume && ts - this.lastRenderAt > ThreePreview.KEEPALIVE_MS) {
        const warm = new THREE.WebGLRenderTarget(1, 1);
        this.renderer.setRenderTarget(warm);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
        warm.dispose();
        this.lastRenderAt = ts;
      }
      return;
    }
    this.updateCameraUniform();
    this.renderer.render(this.scene, this.camera);
    this.lastRenderAt = ts;
    this.dirty = false;
  };

  /**
   * Capture the current 3-D view as a PNG Blob.
   * Forces one synchronous render so the WebGL buffer is guaranteed fresh,
   * then composites the result over the Stage background gradient so the
   * exported image is fully opaque and matches exactly what the user sees
   * (cursor planes, clip mode, colour LUT — everything included).
   */
  /**
   * Synchronous JPEG export for MCP captures.
   *
   * Renders directly at the capped resolution (≤ maxEdge px on the longest
   * edge) rather than rendering at full viewport size and downscaling
   * afterwards. This is critical for expensive presets (bone / tissue) that
   * do per-voxel raycasting — rendering at 512 px instead of a 1600×1200
   * retina viewport cuts the pixel count by ~10× and keeps the operation well
   * inside the MCP tool timeout.
   *
   * Returns a raw base64 JPEG string (no data-URL prefix).
   */
  captureJpeg(maxEdge = 512, quality = 0.92): string {
    const el = this.renderer.domElement;
    const dpr = this.renderer.getPixelRatio();
    const m = this.volume?.material;

    // Capture size: keep aspect ratio, cap at maxEdge.
    const cssW = Math.round(el.width / dpr);
    const cssH = Math.round(el.height / dpr);
    const scale = Math.min(1, maxEdge / Math.max(cssW, cssH));
    const capW = Math.max(1, Math.round(cssW * scale));
    const capH = Math.max(1, Math.round(cssH * scale));

    // Save shader state.
    const origSteps = m?.uniforms.u_steps.value as number | undefined;
    const origShading = m?.uniforms.u_shading.value as number | undefined;

    // Reduce raycast cost for capture:
    //  • 64 steps (vs 256) — 4× fewer per-fragment iterations; negligible quality
    //    loss at ≤512 px for AI analysis thumbnails
    //  • Phong shading off — eliminates 6 extra texture lookups per step for
    //    gradient estimation
    if (m) {
      m.uniforms.u_steps.value = 64;
      m.uniforms.u_shading.value = 0;
    }

    // Render to an offscreen WebGLRenderTarget — the main canvas is never touched
    // so the 3-D view in the browser is not affected.
    const target = new THREE.WebGLRenderTarget(capW, capH);
    this.renderer.setRenderTarget(target);
    this.updateCameraUniform();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    // Read pixels (WebGL origin is bottom-left → flip vertically).
    const pixels = new Uint8Array(capW * capH * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, capW, capH, pixels);
    target.dispose();

    const flipped = new Uint8ClampedArray(capW * capH * 4);
    const rowBytes = capW * 4;
    for (let y = 0; y < capH; y++) {
      flipped.set(pixels.subarray((capH - 1 - y) * rowBytes, (capH - y) * rowBytes), y * rowBytes);
    }

    // Restore shader state.
    if (m) {
      m.uniforms.u_steps.value = origSteps ?? 256;
      m.uniforms.u_shading.value = origShading ?? 1;
    }

    // Encode to JPEG via a temp 2D canvas.
    const off = document.createElement('canvas');
    off.width = capW;
    off.height = capH;
    const captureCtx = off.getContext('2d');
    if (!captureCtx) throw new Error('captureJpeg: failed to acquire 2D context');
    captureCtx.putImageData(new ImageData(flipped, capW, capH), 0, 0);
    return off.toDataURL('image/jpeg', quality).replace(/^data:[^;]+;base64,/, '');
  }

  exportPNG(): Promise<Blob> {
    // Force one synchronous render so the WebGL buffer is current.
    this.updateCameraUniform();
    this.renderer.render(this.scene, this.camera);

    const src = this.renderer.domElement;
    const off = document.createElement('canvas');
    off.width = src.width;
    off.height = src.height;
    const ctx = off.getContext('2d');
    if (!ctx) throw new Error('exportPNG: failed to acquire 2D context');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.drawImage(src, 0, 0);

    return new Promise((resolve, reject) => {
      off.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
        'image/png',
      );
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.controls?.dispose();
    if (this.volume) disposeVolumeObject(this.volume);
    this.cursorPlanes.dispose();
    this.measurementLine.dispose();
    this.annotationMarkers.dispose();
    this.renderer.dispose();
  }
}
