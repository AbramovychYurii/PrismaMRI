import { cursorToTextureVoxel } from '@/lib/volume/plane';
import { AnnotationMarkers } from '@/lib/volume/three-preview/annotation-markers';
import { buildCamera, buildControls, frameCamera } from '@/lib/volume/three-preview/camera';
import { MeasurementLine } from '@/lib/volume/three-preview/measurement-line';
import {
  type VolumeObject,
  buildVolumeMesh,
  disposeVolumeObject,
} from '@/lib/volume/three-preview/volume-object';
import {
  type RenderPreset,
  buildPreIntegratedTF,
  buildTransferFunction,
  isLowPower,
} from '@/lib/volume/three-preview/volume-shader';
import type {
  ActiveMeasurement,
  AiAnnotation,
  PlanesMode,
  PreparedVolumeFor3D,
  SlicePlane,
  Vec3,
  VolumeCursor,
} from '@/types';
import * as THREE from 'three';
import type { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

/** Full-quality ray-march step count.  Bumped from 256 → 384 to pair with
 *  empty-space skipping: the grid now skips ~30-60 % of empty-air steps for
 *  free, so the extra ray budget goes into surface detail/anti-banding.
 *  Low-power devices fall back to 256 to keep frame times reasonable. */
const RAY_STEPS = isLowPower ? 256 : 384;

/**
 * Pick the best supported container/codec for MediaRecorder canvas capture.
 * VP9 → VP8 → generic WebM cover Chrome/Firefox; MP4 (H.264) is the Safari
 * fallback. Returns null when the browser can't record video at all.
 */
function pickVideoMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? null;
}

export class ThreePreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private controls: TrackballControls | null = null;
  private volume: VolumeObject | null = null;
  private readonly measurementLine = new MeasurementLine();
  private readonly annotationMarkers = new AnnotationMarkers();
  /** Voxel spacing of the loaded volume — for marker world placement. */
  private _spacing: readonly [number, number, number] = [1, 1, 1];
  /** Texture dims, and the full-resolution dims the cursor is expressed in.
   *  The two differ whenever prepareVolumeFor3D had to shrink an axis. */
  private textureDims: Vec3 = [1, 1, 1];
  private sourceDims: Vec3 = [1, 1, 1];
  /** Latest annotation list + active id, re-applied when a volume (re)loads. */
  private _annotations: AiAnnotation[] = [];
  private _activeAnnotationId: string | null = null;
  private sceneSize = 200;
  private raf = 0;
  private disposed = false;
  private dirty = true;
  /** True while a turntable video is being recorded — the main render loop
   *  yields so it can't overwrite the camera the recording is animating. */
  private _recording = false;
  /** Timestamp of the last renderer.render() call — used to keep the GPU warm. */
  private lastRenderAt = 0;
  /** Interval between keepalive renders when the scene is otherwise idle (ms). */
  private static readonly KEEPALIVE_MS = 8_000;
  /** 1x1 target the keepalive renders into. Allocated once — creating and
   *  disposing a GPU resource every 8 s was the most expensive part of what is
   *  meant to be the cheapest path in the loop. */
  private readonly warmTarget = new THREE.WebGLRenderTarget(1, 1);
  /** Native device pixel ratio (capped at 2). Used to restore after interaction. */
  private readonly nativeDpr = Math.min(window.devicePixelRatio, 2);

  // Pre-allocated scratch objects — avoid per-frame GC pressure.
  private readonly _invModel = new THREE.Matrix4();
  private readonly _camVoxel = new THREE.Vector3();
  private readonly _fwdWorld = new THREE.Vector3();
  private readonly _fwdVoxel = new THREE.Vector3();

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
      // No preserveDrawingBuffer: it forces the driver to keep a second copy of
      // the buffer and blocks swap optimisations on *every* frame. Both export
      // paths render offscreen instead (see renderToPixels), so nothing ever
      // needs to read the visible buffer back after a swap.
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.sortObjects = false;
    this.scene.add(this.measurementLine.group);
    this.scene.add(this.annotationMarkers.group);
    this.camera = buildCamera(1, 256);
    this.resize();
    this.loop();
  }

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
    this.textureDims = dims;
    this.sourceDims = prepared.sourceDims;

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
        // We intentionally do NOT toggle AO here — toggling AO between orbit
        // and rest causes a visible brightness flash on release (AO crushes
        // creases darker), which is worse UX than the perf hit.  If mobile
        // perf becomes a problem, gate AO on hardwareConcurrency at startup
        // instead of toggling per-interaction.
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

  setRenderPreset(preset: RenderPreset): void {
    const m = this.volume?.material;
    if (!m) return;

    // Swap both colormap textures: 1D (point-sample, MIP + cut-face) and
    // 2D pre-integrated (DVR segment compositing).  Both depend on the
    // preset and must stay in lock-step.
    const oldColormap = this.volume!.colormap;
    const oldColormapPre = this.volume!.colormapPre;
    const newColormap = buildTransferFunction(preset);
    const newColormapPre = buildPreIntegratedTF(preset);
    m.uniforms.u_cmdata.value = newColormap;
    m.uniforms.u_cmdataPre.value = newColormapPre;
    this.volume!.colormap = newColormap;
    this.volume!.colormapPre = newColormapPre;
    oldColormap.dispose();
    oldColormapPre.dispose();

    // Mode: MIP vs DVR
    m.uniforms.u_mode.value = preset === 'mip' ? 1 : 0;

    // Phong shading always on for DVR presets, irrelevant for MIP
    m.uniforms.u_shading.value = preset !== 'mip' ? 1 : 0;

    m.uniforms.u_steps.value = RAY_STEPS;

    this.dirty = true;
  }

  setCursor(cursor: VolumeCursor): void {
    // Sync shader plane position (texture voxel space)
    const m = this.volume?.material;
    if (!m) return;
    const [px, py, pz] = cursorToTextureVoxel(cursor, this.textureDims, this.sourceDims);
    m.uniforms.u_planePos.value.set(px, py, pz);

    // The uniform is read only where a slice plane is drawn or the volume is
    // clipped against it. With both off — the default — the cursor cannot
    // change a single pixel of this view, so repainting would ray-march the
    // whole texture to produce the identical frame. On a full-body study that
    // is what made scrubbing feel stuck: every slice step queued a full
    // volumetric render nobody could see.
    const planesVisible = (m.uniforms.u_planeMode.value as number) !== 0;
    const clipping = (m.uniforms.u_clipMode.value as number) === 1;
    if (planesVisible || clipping) this.dirty = true;
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

    // While recording a turntable video, exportRotationVideo drives the
    // camera + render itself. Skip the loop's own controls.update()/render so
    // it can't fight the animation (controls.update() rewrites camera.position
    // from its internal _eye every frame).
    if (this._recording) return;

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
        this.renderer.setRenderTarget(this.warmTarget);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
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
   * Render the scene into an offscreen target and return its pixels as a
   * top-down RGBA buffer (WebGL's origin is bottom-left, so rows are flipped).
   *
   * Rendering offscreen rather than reading back the visible canvas is what
   * lets the renderer run without `preserveDrawingBuffer` — the visible view is
   * never touched, so there is also no flash and no dependency on when the
   * browser swaps buffers.
   */
  private renderToPixels(width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
    const target = new THREE.WebGLRenderTarget(width, height);
    this.renderer.setRenderTarget(target);
    this.updateCameraUniform();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    const pixels = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    target.dispose();

    const flipped = new Uint8ClampedArray(width * height * 4);
    const rowBytes = width * 4;
    for (let y = 0; y < height; y++) {
      flipped.set(
        pixels.subarray((height - 1 - y) * rowBytes, (height - y) * rowBytes),
        y * rowBytes,
      );
    }
    return flipped;
  }

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

    // Shader state to restore afterwards. Read together with the material so
    // the pair is either both present or both absent — no fallback constants,
    // which could silently drift from the real defaults.
    const saved = m
      ? { steps: m.uniforms.u_steps.value, shading: m.uniforms.u_shading.value }
      : null;

    // Reduce raycast cost for capture:
    //  • 64 steps (vs 256) — 4× fewer per-fragment iterations; negligible quality
    //    loss at ≤512 px for AI analysis thumbnails
    //  • Phong shading off — eliminates 6 extra texture lookups per step for
    //    gradient estimation
    if (m) {
      m.uniforms.u_steps.value = 64;
      m.uniforms.u_shading.value = 0;
    }

    const flipped = this.renderToPixels(capW, capH);

    // Restore shader state.
    if (m && saved) {
      m.uniforms.u_steps.value = saved.steps;
      m.uniforms.u_shading.value = saved.shading;
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

  /**
   * Capture the 3-D view as an opaque PNG Blob, at the same resolution and
   * full quality the user is looking at.
   */
  exportPNG(): Promise<Blob> {
    const el = this.renderer.domElement;
    const width = el.width;
    const height = el.height;
    const flipped = this.renderToPixels(width, height);

    // Flatten onto black, matching the Stage background. Empty rays are
    // `discard`ed so they keep the transparent clear, and the volume writes
    // premultiplied colour (front-to-back accumulation) — so compositing over
    // black is exactly: keep RGB, make every pixel opaque.
    for (let i = 3; i < flipped.length; i += 4) flipped[i] = 255;

    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const ctx = off.getContext('2d');
    if (!ctx) throw new Error('exportPNG: failed to acquire 2D context');
    ctx.putImageData(new ImageData(flipped, width, height), 0, 0);

    return new Promise((resolve, reject) => {
      off.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
        'image/png',
      );
    });
  }

  /** True if this browser can record the canvas to a video file at all. */
  static canRecordVideo(): boolean {
    return (
      typeof MediaRecorder !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
      pickVideoMime() !== null
    );
  }

  /** Extension of the recorded video on this browser: 'webm', 'mp4' (Safari),
   *  or null if recording is unsupported. Used to label export/share actions
   *  with the real format the user will get. */
  static videoFileExt(): string | null {
    const mime = pickVideoMime();
    if (mime === null) return null;
    return mime.includes('mp4') ? 'mp4' : 'webm';
  }

  /**
   * Record a smooth 360° turntable of the current 3-D view to a video Blob.
   *
   * Captures the live canvas via MediaRecorder while the camera orbits the
   * volume around the world-vertical (Z) axis through the orbit target. The
   * camera's current zoom, tilt and distance are preserved — only the azimuth
   * sweeps a full turn — so the export matches whatever framing the user set
   * up. The render happens on the visible canvas, so the user sees the spin as
   * it records (which doubles as a progress indicator).
   *
   * MediaRecorder samples the canvas at `fps`; we render on every animation
   * frame, so playback is as smooth as the device can render. Returns the
   * encoded Blob (WebM where supported, MP4 on Safari) plus its file extension.
   */
  async exportRotationVideo(
    opts: { durationMs?: number; fps?: number; onProgress?: (t: number) => void } = {},
  ): Promise<{ blob: Blob; ext: string }> {
    if (this._recording) throw new Error('A recording is already in progress');
    if (!this.volume || !this.controls) throw new Error('No volume loaded');
    const mime = pickVideoMime();
    if (typeof MediaRecorder === 'undefined' || mime === null) {
      throw new Error('This browser cannot record video (MediaRecorder unsupported)');
    }

    const { durationMs = 5000, fps = 30, onProgress } = opts;

    // Save camera + control state so the view is exactly restored afterwards.
    const savedPos = this.camera.position.clone();
    const savedUp = this.camera.up.clone();
    const controlsWasEnabled = this.controls.enabled;
    this.controls.enabled = false;
    this._recording = true;

    // Turntable axis = world vertical (Z, the anatomical head–foot axis in this
    // scene), passing through the orbit target. Orbit the saved camera offset
    // around it so zoom/tilt/distance are all preserved.
    const target = this.controls.target.clone();
    const offset0 = savedPos.clone().sub(target);
    const axis = new THREE.Vector3(0, 0, 1);
    const rotated = new THREE.Vector3();

    const stream = this.canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });

    recorder.start();
    try {
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const step = (now: number): void => {
          if (this.disposed) {
            resolve();
            return;
          }
          const t = Math.min(1, (now - start) / durationMs);
          rotated.copy(offset0).applyAxisAngle(axis, t * Math.PI * 2);
          this.camera.position.copy(target).add(rotated);
          this.camera.up.set(0, 0, 1);
          this.camera.lookAt(target);
          this.updateCameraUniform();
          this.renderer.render(this.scene, this.camera);
          onProgress?.(t);
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    } finally {
      recorder.stop();
      // Restore the camera and hand control back to the trackball.
      this.camera.position.copy(savedPos);
      this.camera.up.copy(savedUp);
      this.camera.lookAt(target);
      this.controls.enabled = controlsWasEnabled;
      this.controls.update();
      this._recording = false;
      this.dirty = true;
    }

    const blob = await finished;
    return { blob, ext: mime.includes('mp4') ? 'mp4' : 'webm' };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.controls?.dispose();
    if (this.volume) disposeVolumeObject(this.volume);
    this.measurementLine.dispose();
    this.annotationMarkers.dispose();
    this.warmTarget.dispose();
    this.renderer.dispose();
  }
}
