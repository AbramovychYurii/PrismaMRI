import { stepsFromWheelDelta } from '@/hooks/useSliceScroll';
import { describe, expect, it } from 'vitest';

const PX = 28; // WHEEL_PX_PER_STEP

describe('stepsFromWheelDelta', () => {
  it('does not move below one step, but keeps the distance', () => {
    // Trackpads emit dozens of tiny deltas; each alone must not step, and none
    // of them may be thrown away either.
    const { steps, remainder } = stepsFromWheelDelta(PX - 1);
    expect(steps).toBe(0);
    expect(remainder).toBe(PX - 1);
  });

  it('steps once per threshold crossed', () => {
    expect(stepsFromWheelDelta(PX).steps).toBe(1);
    expect(stepsFromWheelDelta(PX * 2).steps).toBe(2);
    expect(stepsFromWheelDelta(PX * 2 - 1).steps).toBe(1);
  });

  it('applies a fast flick in full instead of capping it', () => {
    // This is the regression guard. The old flush clamped to 3 slices per
    // frame, so a 996-slice study took ~5 s of solid scrolling to cross — even
    // though moving 3 slices and moving 100 cost exactly the same.
    expect(stepsFromWheelDelta(PX * 100).steps).toBe(100);
    expect(stepsFromWheelDelta(PX * 900).steps).toBe(900);
  });

  it('is symmetric for scrolling back', () => {
    for (const n of [1, 5, 100]) {
      expect(stepsFromWheelDelta(-PX * n).steps).toBe(-n);
    }
    // Math.trunc of a small negative gives -0. The flush guards with
    // `steps === 0`, which treats it as zero, so only Object.is can tell.
    expect(stepsFromWheelDelta(-(PX - 1)).steps).toBeCloseTo(0);
  });

  it('never carries a remainder large enough to step', () => {
    // A remainder at or beyond the threshold would step again next frame with
    // no new input — the "keeps creeping after you stop" symptom.
    for (const delta of [0, 1, 27, 28, 29, 55, 1000, -1000, 12345.6]) {
      const { remainder } = stepsFromWheelDelta(delta);
      expect(Math.abs(remainder)).toBeLessThan(PX);
    }
  });

  it('loses nothing across frames: steps and remainder reconstruct the input', () => {
    for (const delta of [0, 13, 28, 41, 999, -77, -28.5]) {
      const { steps, remainder } = stepsFromWheelDelta(delta);
      expect(steps * PX + remainder).toBeCloseTo(delta, 9);
    }
  });

  it('crosses the threshold exactly once when a slow scroll is accumulated', () => {
    // Ten deltas of 10 px = 100 px = 3 steps and 16 px left over. Feeding them
    // one frame at a time must give the same total as one big delta.
    let carried = 0;
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const { steps, remainder } = stepsFromWheelDelta(carried + 10);
      total += steps;
      carried = remainder;
    }
    expect(total).toBe(stepsFromWheelDelta(100).steps);
    expect(total).toBe(3);
  });

  it('honours a custom pixels-per-step', () => {
    expect(stepsFromWheelDelta(100, 10)).toEqual({ steps: 10, remainder: 0 });
  });
});
