import * as THREE from 'three';

const DOT_COLOR = new THREE.Color(0xff4500);

// ── Tuning knobs ───────────────────────────────────────────────────────────
// All sizes are relative to sceneSize (max physical extent of the volume, mm).

/** Sphere radius = sceneSize × this */
const POINT_RADIUS_FACTOR = 0.003;

/** Tick half-height floor = sceneSize × this (grows with distance too) */
const TICK_SCENE_FACTOR = 0.007;
/** Tick half-height = max(scene floor, distance × this) */
const TICK_DIST_FACTOR = 0.018;
/** mm ticks height = base tickH × this */
const TICK_MM_SCALE = 0.3;
/** cm ticks height = base tickH × this */
const TICK_CM_SCALE = 0.5;

/** Base label width floor = sceneSize × this */
const LABEL_SCENE_FACTOR = 0.14;
/** Base label width = max(scene floor, distance × this) */
const LABEL_DIST_FACTOR = 0.28;
/** Final label width = base × this (overall text scale) */
const LABEL_SCALE = 1.25;
/** Label height = label width × this (aspect ratio of sprite canvas) */
const LABEL_ASPECT = 0.22;

function stablePerpendicular(dir: THREE.Vector3): THREE.Vector3 {
  const ax = Math.abs(dir.x);
  const ay = Math.abs(dir.y);
  const az = Math.abs(dir.z);
  let ref: THREE.Vector3;
  if (ax <= ay && ax <= az) ref = new THREE.Vector3(1, 0, 0);
  else if (ay <= ax && ay <= az) ref = new THREE.Vector3(0, 1, 0);
  else ref = new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3().crossVectors(dir, ref).normalize();
}

function tickStep(distanceMm: number): number {
  if (distanceMm < 50) return 1; // < 5 cm  → every 1 mm
  if (distanceMm < 200) return 10; // < 20 cm → every 1 cm
  return 10; // ≥ 20 cm → every 10 cm
}

function disposeObject(obj: THREE.Object3D): void {
  if (obj instanceof THREE.Sprite) {
    obj.material.map?.dispose();
    obj.material.dispose();
    return;
  }
  const mesh = obj as THREE.Mesh;
  mesh.geometry?.dispose();
  (mesh.material as THREE.Material)?.dispose();
}

function buildMainLine(from: THREE.Vector3, to: THREE.Vector3): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({
    color: DOT_COLOR,
    depthTest: false,
  });
  return new THREE.Line(geo, mat);
}

function buildTicks(
  fromWorld: THREE.Vector3,
  dir: THREE.Vector3,
  len: number,
  distanceMm: number,
  tickH: number,
  perp: THREE.Vector3,
): THREE.LineSegments | null {
  const step = tickStep(distanceMm);
  const h = step === 1 ? tickH * TICK_MM_SCALE : tickH * TICK_CM_SCALE;
  const pts: number[] = [];
  for (let d = step; d < distanceMm - step * 0.4; d += step) {
    const t = (d / distanceMm) * len;
    const center = new THREE.Vector3().copy(fromWorld).addScaledVector(dir, t);
    pts.push(
      ...center.clone().addScaledVector(perp, h).toArray(),
      ...center.clone().addScaledVector(perp, -h).toArray(),
    );
  }
  if (pts.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({
    color: DOT_COLOR,
    depthTest: false,
  });
  return new THREE.LineSegments(geo, mat);
}

function makeLabel(text: string): THREE.Sprite {
  const W = 512;
  const H = 80;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d ctx');
  ctx.clearRect(0, 0, W, H);

  ctx.font = 'bold 42px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Dark drop-shadow for legibility on bright tissue
  ctx.shadowColor = 'rgba(0,0,0,0.99)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  ctx.fillStyle = `#${DOT_COLOR.getHexString()}`;
  ctx.fillText(text, W / 2, H / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    transparent: true,
  });
  return new THREE.Sprite(mat);
}

function makePointMarker(radius: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 10, 10);
  const mat = new THREE.MeshBasicMaterial({
    color: DOT_COLOR,
    depthTest: false,
  });
  return new THREE.Mesh(geo, mat);
}

export class MeasurementLine {
  readonly group = new THREE.Group();
  private objects: THREE.Object3D[] = [];

  /** Show single "from" marker while waiting for second point. */
  setFrom(fromWorld: THREE.Vector3, sceneSize: number): void {
    this.clear();
    const radius = sceneSize * POINT_RADIUS_FACTOR;
    const sphere = makePointMarker(radius);
    sphere.position.copy(fromWorld);
    this.add(sphere);
  }

  /** Show full line + ticks + label between two points. */
  setBoth(
    fromWorld: THREE.Vector3,
    toWorld: THREE.Vector3,
    distanceMm: number,
    sceneSize: number,
  ): void {
    this.clear();

    const dir = new THREE.Vector3().subVectors(toWorld, fromWorld);
    const len = dir.length();
    if (len < 0.001) return;
    dir.normalize();

    const radius = sceneSize * POINT_RADIUS_FACTOR;
    const tickH = Math.max(sceneSize * TICK_SCENE_FACTOR, distanceMm * TICK_DIST_FACTOR);
    const labelW = Math.max(sceneSize * LABEL_SCENE_FACTOR, distanceMm * LABEL_DIST_FACTOR);
    const perp = stablePerpendicular(dir);

    this.add(buildMainLine(fromWorld, toWorld));

    for (const pos of [fromWorld, toWorld]) {
      const marker = makePointMarker(radius);
      marker.position.copy(pos);
      this.add(marker);
    }

    const ticks = buildTicks(fromWorld, dir, len, distanceMm, tickH, perp);
    if (ticks) this.add(ticks);

    const label = makeLabel(`${distanceMm.toFixed(1)} mm`);
    label.position
      .copy(new THREE.Vector3().lerpVectors(fromWorld, toWorld, 0.5))
      .addScaledVector(perp, tickH * 3);
    label.scale.set(labelW * LABEL_SCALE, labelW * LABEL_SCALE * LABEL_ASPECT, 1);
    this.add(label);
  }

  clear(): void {
    for (const obj of this.objects) {
      this.group.remove(obj);
      disposeObject(obj);
    }
    this.objects = [];
  }

  private add(obj: THREE.Object3D): void {
    this.objects.push(obj);
    this.group.add(obj);
  }

  dispose(): void {
    this.clear();
  }
}
