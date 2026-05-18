import { ACCENT_HEX_NUM, PLANE_ACCENT_KEY } from '@/constants';
import type { Vec3, VolumeCursor } from '@/types';
import * as THREE from 'three';

/**
 * PrismaMRI plane accents — must match the side-panel slice accents:
 *   Coronal  (fixed Y, spans X/Z) → amber
 *   Sagittal (fixed X, spans Y/Z) → violet
 *   Axial    (fixed Z, spans X/Y) → azure
 */
const CORONAL = ACCENT_HEX_NUM[PLANE_ACCENT_KEY.coronal];
const SAGITTAL = ACCENT_HEX_NUM[PLANE_ACCENT_KEY.sagittal];
const AXIAL = ACCENT_HEX_NUM[PLANE_ACCENT_KEY.axial];

interface AxisPlane {
  fill: THREE.Mesh;
  edge: THREE.LineSegments;
}

/**
 * Three filled, semi-transparent quads that intersect at the cursor (the
 * coordinate origin of the slice views). Each is tinted with its plane's
 * accent so the 3D view speaks the same colour language as the rail.
 */
export class CursorPlanes {
  readonly group = new THREE.Group();
  /** Box / texture dims (may be downsampled). */
  private dims: Vec3 = [1, 1, 1];
  /** Full-resolution source dims the cursor is expressed in. */
  private srcDims: Vec3 = [1, 1, 1];
  private readonly coronal: AxisPlane;
  private readonly sagittal: AxisPlane;
  private readonly axial: AxisPlane;

  constructor() {
    this.coronal = this.makePlane(CORONAL);
    this.sagittal = this.makePlane(SAGITTAL);
    this.axial = this.makePlane(AXIAL);
    for (const p of [this.coronal, this.sagittal, this.axial]) {
      this.group.add(p.fill, p.edge);
    }
    this.group.renderOrder = 999;
  }

  /** Unit quad in local XY (normal +Z), scaled & oriented per axis. */
  private makePlane(color: number): AxisPlane {
    const geo = new THREE.PlaneGeometry(1, 1);
    const fill = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
    );
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        depthTest: false,
      }),
    );
    fill.renderOrder = 999;
    edge.renderOrder = 1000;
    return { fill, edge };
  }

  private place(
    p: AxisPlane,
    pos: [number, number, number],
    scale: [number, number, number],
    rot: [number, number, number],
  ): void {
    for (const o of [p.fill, p.edge]) {
      o.position.set(pos[0], pos[1], pos[2]);
      o.scale.set(scale[0], scale[1], scale[2]);
      o.rotation.set(rot[0], rot[1], rot[2]);
    }
  }

  /** `dims` = box/texture dims, `srcDims` = full-res dims of the cursor. */
  setDims(dims: Vec3, srcDims?: Vec3): void {
    this.dims = dims;
    this.srcDims = srcDims ?? dims;
  }

  update(cursor: VolumeCursor): void {
    const [w, h, d] = this.dims;
    const cx = w / 2 - 0.5;
    const cy = h / 2 - 0.5;
    const cz = d / 2 - 0.5;

    // Map the full-resolution cursor into the (possibly downsampled) box so
    // the planes land at the same anatomy the slice panels show.
    const px = (cursor.x / Math.max(1, this.srcDims[0] - 1)) * (w - 1);
    const py = (cursor.y / Math.max(1, this.srcDims[1] - 1)) * (h - 1);
    const pz = (cursor.z / Math.max(1, this.srcDims[2] - 1)) * (d - 1);

    // Axial (fixed Z, spans X/Y) — no rotation, normal +Z
    this.place(this.axial, [cx, cy, pz], [w, h, 1], [0, 0, 0]);

    // Coronal (fixed Y, spans X/Z) — rotate about X so local Y → world Z
    this.place(this.coronal, [cx, py, cz], [w, d, 1], [-Math.PI / 2, 0, 0]);

    // Sagittal (fixed X, spans Y/Z) — rotate about Y so local X → world Z
    this.place(this.sagittal, [px, cy, cz], [d, h, 1], [0, Math.PI / 2, 0]);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  dispose(): void {
    for (const p of [this.coronal, this.sagittal, this.axial]) {
      p.fill.geometry.dispose();
      (p.fill.material as THREE.Material).dispose();
      p.edge.geometry.dispose();
      (p.edge.material as THREE.Material).dispose();
    }
  }
}
