import * as THREE from 'three';

const DOT_COLOR = new THREE.Color(0xff4500);

// ── Tuning knobs ───────────────────────────────────────────────────────────
// All sizes are relative to sceneSize (max physical extent of the volume, mm).

/** Sphere radius = sceneSize × this */
const POINT_RADIUS_FACTOR = 0.003;

/** Tick half-height — used only for label offset above the line. */
const TICK_SCENE_FACTOR = 0.007;
const TICK_DIST_FACTOR = 0.018;

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
  const mat = new THREE.LineDashedMaterial({
    color: DOT_COLOR,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    dashSize: 2,
    gapSize: 1.5,
  });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  return line;
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
    depthWrite: false,
    transparent: true,
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
    obj.renderOrder = 999;
    this.objects.push(obj);
    this.group.add(obj);
  }

  dispose(): void {
    this.clear();
  }
}
