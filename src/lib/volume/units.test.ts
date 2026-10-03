import { intensityUnit } from '@/lib/volume/units';
import { describe, expect, it } from 'vitest';

describe('intensityUnit', () => {
  it('is HU for CT only', () => {
    expect(intensityUnit('CT')).toBe('HU');
    expect(intensityUnit('MR')).toBe('');
    expect(intensityUnit(undefined)).toBe('');
  });
});
