import { OCCUPANCY_EDGE, computeOccupancy } from '@/lib/volume/occupancy';
import { describe, expect, it } from 'vitest';

const cells = OCCUPANCY_EDGE ** 3;
const cellIndex = (x: number, y: number, z: number) =>
  z * OCCUPANCY_EDGE * OCCUPANCY_EDGE + y * OCCUPANCY_EDGE + x;

describe('computeOccupancy', () => {
  it('marks nothing in an empty volume', () => {
    const grid = computeOccupancy(new Uint8Array(64 * 64 * 64), [64, 64, 64]);
    expect(grid.length).toBe(cells);
    expect(grid.every((v) => v === 0)).toBe(true);
  });

  it('marks exactly the cell holding a voxel above the air threshold', () => {
    const [w, h] = [64, 64];
    const data = new Uint8Array(64 * 64 * 64);
    data[10 + w * (20 + h * 40)] = 200; // voxel (10, 20, 40) → cell (5, 10, 20)
    const grid = computeOccupancy(data, [64, 64, 64]);
    expect(grid[cellIndex(5, 10, 20)]).toBe(255);
    expect(grid.reduce((n, v) => n + (v ? 1 : 0), 0)).toBe(1);
  });

  it('treats values below the threshold as air', () => {
    const data = new Uint8Array(64 * 64 * 64).fill(24);
    expect(computeOccupancy(data, [64, 64, 64]).every((v) => v === 0)).toBe(true);
    data[0] = 25;
    expect(computeOccupancy(data, [64, 64, 64])[0]).toBe(255);
  });

  it('covers volumes smaller than the grid', () => {
    const data = new Uint8Array(4 * 4 * 4).fill(255);
    const grid = computeOccupancy(data, [4, 4, 4]);
    expect(grid[cellIndex(0, 0, 0)]).toBe(255);
    expect(grid[cellIndex(31, 31, 31)]).toBe(255);
  });
});
