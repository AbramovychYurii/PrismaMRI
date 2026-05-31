import { SEVERITY_HEX_NUM } from '@/constants';
import type { AiAnnotation } from '@/types';
import * as THREE from 'three';

/** Sphere radius = sceneSize × this. */
const RADIUS_FACTOR = 0.011;
/** Active marker is scaled up by this factor. */
const ACTIVE_SCALE = 1.7;

interface Marker {
  /** Solid core sphere. */
  core: THREE.Mesh;
  /** Translucent halo ring for visibility over bright tissue. */
  halo: THREE.Mesh;
  baseRadius: number;
}

function disposeMesh(m: THREE.Mesh): void {
  m.geometry.dispose();
  (m.material as THREE.Material).dispose();
}

/**
 * Renders AI findings as colour-coded billboards floating at their voxel
 * positions in the 3-D scene.  The active finding is enlarged and brightened.
 *
 * Mirrors the MeasurementLine pattern: depth-test disabled so markers stay
 * visible through the volume, high renderOrder so they draw last.
 */
export class AnnotationMarkers {
  readonly group = new THREE.Group();
  private markers = new Map<string, Marker>();

  setAnnotations(
    list: AiAnnotation[],
    spacing: readonly [number, number, number],
    sceneSize: number,
  ): void {
    this.clear();
    const [sx, sy, sz] = spacing;
    const radius = sceneSize * RADIUS_FACTOR;

    for (const a of list) {
      const color = new THREE.Color(SEVERITY_HEX_NUM[a.severity]);
      const pos = new THREE.Vector3(a.voxel.x * sx, a.voxel.y * sy, a.voxel.z * sz);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 16),
        new THREE.MeshBasicMaterial({
          color,
          depthTest: false,
          depthWrite: false,
          transparent: true,
          opacity: 0.95,
        }),
      );
      core.position.copy(pos);
      core.renderOrder = 1001;

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.9, 16, 16),
        new THREE.MeshBasicMaterial({
          color,
          depthTest: false,
          depthWrite: false,
          transparent: true,
          opacity: 0.18,
        }),
      );
      halo.position.copy(pos);
      halo.renderOrder = 1000;

      this.group.add(halo);
      this.group.add(core);
      this.markers.set(a.id, { core, halo, baseRadius: radius });
    }
  }

  /** Enlarge + brighten the active finding; reset all others. */
  setActive(activeId: string | null): void {
    for (const [id, m] of this.markers) {
      const isActive = id === activeId;
      const scale = isActive ? ACTIVE_SCALE : 1;
      m.core.scale.setScalar(scale);
      m.halo.scale.setScalar(scale);
      (m.core.material as THREE.MeshBasicMaterial).opacity = isActive ? 1 : 0.95;
      (m.halo.material as THREE.MeshBasicMaterial).opacity = isActive ? 0.32 : 0.18;
    }
  }

  clear(): void {
    for (const { core, halo } of this.markers.values()) {
      this.group.remove(core);
      this.group.remove(halo);
      disposeMesh(core);
      disposeMesh(halo);
    }
    this.markers.clear();
  }

  dispose(): void {
    this.clear();
  }
}
