import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForPaint } from './canvas-utils';

/** A background tab never runs animation frames, so a capture must not wait for them forever. */
describe('waitForPaint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('resolves after two animation frames when the tab is visible', async () => {
    const frame = vi.fn((cb: () => void) => setTimeout(cb, 16));
    vi.stubGlobal('requestAnimationFrame', frame);

    let done = false;
    void waitForPaint().then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(40);
    expect(frame).toHaveBeenCalledTimes(2);
    expect(done).toBe(true);
  });

  it('does not wait for frames that never come (hidden tab)', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());

    let done = false;
    void waitForPaint(250).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
  });
});
