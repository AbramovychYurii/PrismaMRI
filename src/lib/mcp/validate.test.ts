import {
  optionalNumber,
  optionalSeverity,
  optionalString,
  requireFraction,
  requireNumber,
  requireOneOf,
  requirePlane,
  requireString,
} from '@/lib/mcp/validate';
import { describe, expect, it } from 'vitest';

describe('requirePlane', () => {
  it('accepts the three planes', () => {
    for (const plane of ['coronal', 'sagittal', 'axial']) {
      expect(requirePlane({ plane })).toBe(plane);
    }
  });

  it('rejects anything else', () => {
    for (const bad of ['Coronal', 'transverse', '', 3, null, undefined, {}]) {
      expect(() => requirePlane({ plane: bad })).toThrow();
    }
  });

  it('says which values are allowed and what arrived', () => {
    // The old code let a bad plane reach PLANE_GEOMETRY[undefined] and reported
    // "Cannot read properties of undefined" — true, but unactionable.
    expect(() => requirePlane({ plane: 'sagital' })).toThrow(
      '`plane` must be one of "coronal", "sagittal", "axial" — got "sagital"',
    );
    expect(() => requirePlane({})).toThrow(/got nothing$/);
  });

  it('can check a differently named field', () => {
    expect(requirePlane({ view: 'axial' }, 'view')).toBe('axial');
    expect(() => requirePlane({ view: 'nope' }, 'view')).toThrow(/^`view`/);
  });
});

describe('requireNumber', () => {
  it('accepts finite numbers including zero and negatives', () => {
    expect(requireNumber({ n: 0 }, 'n')).toBe(0);
    expect(requireNumber({ n: -42.5 }, 'n')).toBe(-42.5);
  });

  it('rejects non-finite values and numeric strings', () => {
    // "5" would sail through arithmetic and corrupt a slice index silently.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '5', null, undefined, []]) {
      expect(() => requireNumber({ n: bad }, 'n')).toThrow(/`n` must be a finite number/);
    }
  });
});

describe('optionalNumber', () => {
  it('falls back when the field is absent or null', () => {
    expect(optionalNumber({}, 'slab_mm', 0)).toBe(0);
    expect(optionalNumber({ slab_mm: null }, 'slab_mm', 7)).toBe(7);
  });

  it('uses the value when one is given', () => {
    expect(optionalNumber({ slab_mm: 3 }, 'slab_mm', 0)).toBe(3);
    expect(optionalNumber({ slab_mm: 0 }, 'slab_mm', 5)).toBe(0);
  });

  it('still rejects a present but unusable value', () => {
    // Absent means "default". Present and wrong is a mistake worth reporting.
    expect(() => optionalNumber({ slab_mm: 'thick' }, 'slab_mm', 0)).toThrow();
  });
});

describe('requireFraction', () => {
  it('accepts the closed range 0..1', () => {
    for (const v of [0, 0.5, 1]) expect(requireFraction({ fx: v }, 'fx')).toBe(v);
  });

  it('rejects values outside it', () => {
    // An out-of-range fraction placed the marker outside the image entirely.
    for (const v of [-0.01, 1.01, 200]) {
      expect(() => requireFraction({ fx: v }, 'fx')).toThrow(/between 0 and 1/);
    }
  });
});

describe('requireString', () => {
  it('rejects empty and whitespace-only labels', () => {
    // A blank label renders as an unnamed pin the reader cannot interpret.
    expect(() => requireString({ label: '' }, 'label')).toThrow();
    expect(() => requireString({ label: '   ' }, 'label')).toThrow();
    expect(requireString({ label: 'Lesion' }, 'label')).toBe('Lesion');
  });
});

describe('optionalString', () => {
  it('passes undefined through but validates anything present', () => {
    expect(optionalString({}, 'summary')).toBeUndefined();
    expect(optionalString({ summary: null }, 'summary')).toBeUndefined();
    expect(optionalString({ summary: 'text' }, 'summary')).toBe('text');
    expect(() => optionalString({ summary: 42 }, 'summary')).toThrow();
  });
});

describe('requireOneOf', () => {
  const presets = ['mip', 'bone'] as const;

  it('accepts a listed value', () => {
    expect(requireOneOf({ preset: 'bone' }, 'preset', presets)).toBe('bone');
  });

  it('lists the alternatives, which the agent cannot otherwise guess', () => {
    expect(() => requireOneOf({ preset: 'xray' }, 'preset', presets)).toThrow(
      '`preset` must be one of "mip", "bone" — got "xray"',
    );
  });
});

describe('optionalSeverity', () => {
  it('keeps a recognised severity', () => {
    for (const s of ['critical', 'serious', 'moderate', 'comment']) {
      expect(optionalSeverity({ severity: s })).toBe(s);
    }
  });

  it('falls back to serious rather than dropping the finding', () => {
    // Deliberately forgiving: mislabelling urgency beats losing a finding the
    // agent meant to record.
    for (const bad of ['urgent', '', 3, null, undefined]) {
      expect(optionalSeverity({ severity: bad })).toBe('serious');
    }
  });
});
