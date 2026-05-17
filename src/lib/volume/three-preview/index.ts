import * as THREE from 'three';
import type { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import type { PreparedVolumeFor3D, VolumeCursor } from '@/types';
import { buildCamera, buildControls, frameCamera } from '@/lib/volume/three-preview/camera';
import { CursorPlanes } from '@/lib/volume/three-preview/cursor-planes';
import { buildVolumeMesh, disposeVolumeObject, type VolumeObject } from '@/lib/volume/three-preview/volume-object';

export class ThreePreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private controls: TrackballControls | null = null;
  private volume: VolumeObject | null = null;
  private readonly cursorPlanes = new CursorPlanes();
  private raf = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.add(this.cursorPlanes.group);
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
    const vol = buildVolumeMesh(prepared);
    this.volume = vol;
    this.scene.add(vol.mesh);

    const dims = prepared.dims;
    const [sx, sy, sz] = prepared.spacing;
    this.cursorPlanes.setDims(dims, prepared.sourceDims);
    // Cursor planes are computed in voxel space; scale the group to physical
    // mm so they align with the spacing-scaled volume mesh.
    this.cursorPlanes.group.scale.set(sx, sy, sz);

    // Frame the camera in physical world-space (mm), not voxel counts.
    const center = new THREE.Vector3(
      (dims[0] / 2 - 0.5) * sx,
      (dims[1] / 2 - 0.5) * sy,
      (dims[2] / 2 - 0.5) * sz,
    );
    const maxEdge = Math.max(dims[0] * sx, dims[1] * sy, dims[2] * sz);

    const rect = this.canvas.getBoundingClientRect();
    const aspect = rect.height > 0 ? rect.width / rect.height : 1;
    this.camera = buildCamera(aspect, maxEdge);
    frameCamera(this.camera, center, maxEdge);

    this.controls?.dispose();
    this.controls = buildControls(this.camera, this.canvas, center);
    this.resize();
  }

  setCursor(cursor: VolumeCursor): void {
    this.cursorPlanes.update(cursor);
  }

  /**
   * Window/Level → raycast contrast. `low`/`high` are normalized 0..1 in the
   * texture's quantization space: a narrow band brightens & raises contrast,
   * a wide band flattens it — same intent as the 2D W/L.
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
  }

  setPlanesVisible(visible: boolean): void {
    this.cursorPlanes.setVisible(visible);
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
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.controls?.dispose();
    if (this.volume) disposeVolumeObject(this.volume);
    this.cursorPlanes.dispose();
    this.renderer.dispose();
  }
}
