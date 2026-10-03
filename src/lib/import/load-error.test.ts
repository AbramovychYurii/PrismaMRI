import {
  OUT_OF_MEMORY_MESSAGE,
  TRUNCATED_MESSAGE,
  describeLoadError,
} from '@/lib/import/load-error';
import { describe, expect, it } from 'vitest';

describe('describeLoadError', () => {
  it('rewords allocation failures from each engine', () => {
    for (const raw of [
      'Array buffer allocation failed',
      'Invalid typed array length: 4294967296',
      'invalid array length',
      'Out of memory',
    ]) {
      expect(describeLoadError(new RangeError(raw), 'x')).toBe(OUT_OF_MEMORY_MESSAGE);
    }
  });

  it('rewords reads past the end of the data', () => {
    expect(
      describeLoadError(new RangeError('Offset is outside the bounds of the DataView'), 'x'),
    ).toBe(TRUNCATED_MESSAGE);
  });

  it('keeps messages written for people, and falls back when there is none', () => {
    expect(describeLoadError(new Error('Unsupported NRRD type "block".'), 'x')).toBe(
      'Unsupported NRRD type "block".',
    );
    expect(describeLoadError('boom', 'Failed to load volume.')).toBe('Failed to load volume.');
  });
});
