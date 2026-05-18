import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

/**
 * Orthographic camera sized to the volume's longest edge. VolumeRenderShader1
 * is designed for orthographic projection (parallel ray casting).
 */
export function buildCamera(aspect: number, maxEdge: number): THREE.OrthographicCamera {
  // Must cover the bounding-sphere radius of the volume (worst case: cube diagonal
  // = sqrt(3)/2 ≈ 0.866 × maxEdge). Use 1.0 × maxEdge so corners never clip.
  const half = maxEdge * 1.0;
  const cam = new THREE.OrthographicCamera(
    -half * aspect,
    half * aspect,
    half,
    -half,
    0.01,
    maxEdge * 12,
  );
  return cam;
}

export function frameCamera(
  cam: THREE.OrthographicCamera,
  center: THREE.Vector3,
  maxEdge: number,
): void {
  cam.position.set(center.x + maxEdge * 1.4, center.y - maxEdge * 1.1, center.z + maxEdge * 1.6);
  cam.up.set(0, 0, 1);
  cam.lookAt(center);
}

export function buildControls(
  cam: THREE.OrthographicCamera,
  dom: HTMLElement,
  target: THREE.Vector3,
): TrackballControls {
  const controls = new TrackballControls(cam, dom);
  controls.rotateSpeed = 2.6;
  controls.zoomSpeed = 1.4;
  controls.panSpeed = 0.8;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0.18;
  controls.target.copy(target);
  // Sync internal state (_eye, _lastPosition, etc.) to the camera's current
  // position/target so the first controls.update() in the render loop does not
  // produce a spurious camera jump.
  controls.update();
  return controls;
}
