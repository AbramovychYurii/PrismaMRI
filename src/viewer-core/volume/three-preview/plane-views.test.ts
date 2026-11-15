import { describe, expect, it } from 'vitest';
import type { SlicePlane, Vec3 } from '../../types';
import { PLANE_VIEWS } from './plane-views';

const planes: SlicePlane[] = ['coronal', 'sagittal', 'axial'];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('standard 3-D views', () => {
  it.each(planes)('%s: unit direction and up, and up is not along the line of sight', (plane) => {
    const { dir, up } = PLANE_VIEWS[plane];
    expect(dot(dir, dir)).toBeCloseTo(1);
    expect(dot(up, up)).toBeCloseTo(1);
    // An up vector along the line of sight would make lookAt() degenerate.
    expect(dot(dir, up)).toBeCloseTo(0);
  });

  it('look along three different axes, so the three views show three sides', () => {
    const [c, s, a] = planes.map((p) => PLANE_VIEWS[p].dir);
    expect(dot(c, s)).toBeCloseTo(0);
    expect(dot(c, a)).toBeCloseTo(0);
    expect(dot(s, a)).toBeCloseTo(0);
  });
});
