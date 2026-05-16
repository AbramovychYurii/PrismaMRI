import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

/**
 * Orthographic camera sized to the volume's longest edge. VolumeRenderShader1
 * is designed for orthographic projection (parallel ray casting).
 */
export function buildCamera(aspect: number, maxEdge: number): THREE.OrthographicCamera {
  const half = maxEdge * 0.72;
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
  cam.position.set(
    center.x + maxEdge * 1.4,
    center.y - maxEdge * 1.1,
    center.z + maxEdge * 1.6,
  );
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
  return controls;
}
