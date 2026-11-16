import { describe, expect, it, vi } from 'vitest';
import { runHandler } from './handler-test-utils';
import { MCP_HANDLERS } from './handlers';

// The real wait is two animation frames; there is no browser here.
vi.mock('./canvas-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./canvas-utils')>()),
  waitForPaint: async () => {},
}));

/** A 3-D preview that records which camera each shot was taken from. */
function fakePreview() {
  return {
    shots: [] as string[],
    captureJpeg() {
      this.shots.push('current');
      return 'jpeg-current';
    },
    captureJpegFromPlane(plane: string) {
      this.shots.push(plane);
      return `jpeg-${plane}`;
    },
  };
}

function run(msg: Record<string, unknown>, preview: ReturnType<typeof fakePreview> | null) {
  const viewer = { surfaces: { preview: () => preview } } as never;
  return runHandler(MCP_HANDLERS.capture_3d, viewer, 'capture_3d', msg);
}

describe('capture_3d', () => {
  it('without a view keeps the camera as the user left it', async () => {
    const preview = fakePreview();
    expect(await run({}, preview)).toEqual({ ok: { imageData: 'jpeg-current' } });
    expect(preview.shots).toEqual(['current']);
  });

  it('view "current" is the same as no view', async () => {
    const preview = fakePreview();
    expect(await run({ view: 'current' }, preview)).toEqual({ ok: { imageData: 'jpeg-current' } });
  });

  it.each(['coronal', 'sagittal', 'axial'])(
    'view "%s" shoots from that plane only',
    async (view) => {
      const preview = fakePreview();
      expect(await run({ view }, preview)).toEqual({ ok: { imageData: `jpeg-${view}`, view } });
      expect(preview.shots).toEqual([view]);
    },
  );

  it('view "all" returns the three plane views, in one answer', async () => {
    const preview = fakePreview();
    expect(await run({ view: 'all' }, preview)).toEqual({
      ok: { coronal: 'jpeg-coronal', sagittal: 'jpeg-sagittal', axial: 'jpeg-axial' },
    });
    expect(preview.shots).toEqual(['coronal', 'sagittal', 'axial']);
  });

  it('names the allowed views when given a wrong one', async () => {
    await expect(run({ view: 'left' }, fakePreview())).rejects.toThrow(/coronal/);
  });

  it('says so when the 3-D view is not ready', async () => {
    expect(await run({ view: 'all' }, null)).toEqual({ error: '3-D view not ready' });
  });
});
