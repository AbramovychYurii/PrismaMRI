import { Group, OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createThreeViewTarget } from './three';

/** An orthographic camera looking at the origin from the front, like the viewer's. */
function scene() {
  const camera = new OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
  camera.position.set(0, -300, 0);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const model = new Group();
  const controls = { target: new Vector3(), update: vi.fn() };
  const requestRender = vi.fn();
  const t = createThreeViewTarget({ camera, model, controls, requestRender });
  return { camera, model, controls, requestRender, t };
}

/** Where a point on the model ends up in world space. */
const moved = (model: Group, p: Vector3) => p.clone().applyQuaternion(model.quaternion);

describe('createThreeViewTarget', () => {
  it('pitch up lifts the front (the side facing the camera)', () => {
    const { model, t, requestRender } = scene();
    t.rotate('pitch', 10);
    const front = moved(model, new Vector3(0, -1, 0));
    expect(front.z).toBeGreaterThan(0);
    expect(requestRender).toHaveBeenCalled();
  });

  it('yaw right turns the front to the screen right', () => {
    const { model, t } = scene();
    t.rotate('yaw', 10);
    // Looking along +Y with +Z up, screen right is +X.
    expect(moved(model, new Vector3(0, -1, 0)).x).toBeGreaterThan(0);
  });

  it('roll clockwise turns screen-up towards screen-right', () => {
    const { model, t } = scene();
    t.rotate('roll', 10);
    expect(moved(model, new Vector3(0, 0, 1)).x).toBeGreaterThan(0);
  });

  it('reads back pitch / yaw / roll in the camera frame, and zoom', () => {
    const { t } = scene();
    t.rotate('yaw', 25);
    t.rotate('pitch', 12);
    t.zoomBy(1.25);
    const v = t.getViewState?.();
    expect(v?.yaw).toBeCloseTo(25, 0);
    expect(v?.pitch).toBeCloseTo(12, 0);
    expect(v?.roll).toBeCloseTo(0, 0);
    expect(v?.zoom).toBeCloseTo(1.25);
  });

  it('align resets the rotation and looks along the plane normal (LPS defaults)', () => {
    const { camera, model, t } = scene();
    t.rotate('roll', 40);
    t.alignToPlane('axial');
    expect(model.quaternion.angleTo(model.quaternion.clone().identity())).toBeCloseTo(0);
    // Axial: from the feet, anterior up.
    expect(camera.position.z).toBeLessThan(0);
    expect(camera.up.y).toBeCloseTo(-1);
    t.alignToPlane('sagittal');
    expect(camera.position.x).toBeGreaterThan(0);
  });

  it('zoom is clamped and reset brings everything back', () => {
    const { camera, model, t } = scene();
    for (let i = 0; i < 100; i++) t.zoomBy(2);
    expect(camera.zoom).toBe(40);
    t.rotate('yaw', 30);
    t.alignToPlane('sagittal');
    t.resetView();
    expect(camera.zoom).toBe(1);
    expect(camera.position.y).toBeCloseTo(-300);
    expect(model.quaternion.w).toBeCloseTo(1);
  });

  it('passes the framing inset through', () => {
    const camera = new OrthographicCamera();
    const setFramingInset = vi.fn();
    const t = createThreeViewTarget({ camera, model: new Group(), setFramingInset });
    t.setFramingInset?.({ bottom: 220 });
    expect(setFramingInset).toHaveBeenCalledWith({ bottom: 220 });
  });
});
