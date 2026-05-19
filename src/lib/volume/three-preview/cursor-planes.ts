import type { PlanesMode, SlicePlane, Vec3, VolumeCursor } from '@/types';

/**
 * Tracks the cursor-to-voxel mapping needed by the volume shader's plane
 * uniforms. All plane rendering is fully delegated to the ray-cast shader
 * (DVR + MIP paths), so no Three.js geometry is created here.
 */
export class CursorPlanes {
  /** Box / texture dims (may be downsampled). */
  private dims: Vec3 = [1, 1, 1];
  /** Full-resolution source dims the cursor is expressed in. */
  private srcDims: Vec3 = [1, 1, 1];
  /** Whether any planes are currently active. */
  private active = false;

  /** `dims` = box/texture dims, `srcDims` = full-res dims of the cursor. */
  setDims(dims: Vec3, srcDims?: Vec3): void {
    this.dims = dims;
    this.srcDims = srcDims ?? dims;
  }

  /**
   * Maps a full-resolution cursor to texture voxel space.
   * Called by ThreePreview.setCursor to keep u_planePos in sync.
   */
  mapCursor(cursor: VolumeCursor): [number, number, number] {
    const [w, h, d] = this.dims;
    return [
      (cursor.x / Math.max(1, this.srcDims[0] - 1)) * (w - 1),
      (cursor.y / Math.max(1, this.srcDims[1] - 1)) * (h - 1),
      (cursor.z / Math.max(1, this.srcDims[2] - 1)) * (d - 1),
    ];
  }

  /** No-op — kept so call sites don't need updating. */
  update(_cursor: VolumeCursor): void {}

  isActive(): boolean {
    return this.active;
  }

  setMode(mode: PlanesMode, _activePlane: SlicePlane): void {
    this.active = mode !== 'off';
  }

  dispose(): void {}
}
