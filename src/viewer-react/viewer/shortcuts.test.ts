import { describe, expect, it } from 'vitest';
import { viewerShortcuts } from './shortcuts';

describe('viewerShortcuts', () => {
  it('lists the viewer’s controls in groups', () => {
    const groups = viewerShortcuts();
    expect(groups.map((g) => g.title)).toEqual(['Slices', '2D Panels', 'Series', '3D View']);
    expect(groups[2].shortcuts[0]).toEqual({ keys: ['[ / ]'], action: 'Previous / next series' });
  });

  it('takes its words from labels, and keeps key names as they are', () => {
    const groups = viewerShortcuts({
      shortcuts: { view3d: 'Вигляд 3D', drag: 'Тягти', orbit: 'Обертати' },
    });
    const view3d = groups[3];
    expect(view3d.title).toBe('Вигляд 3D');
    expect(view3d.shortcuts[0]).toEqual({ keys: ['Тягти'], action: 'Обертати' });
    // Untouched words keep their defaults; key names never change.
    expect(view3d.shortcuts[1].action).toBe('Zoom');
    expect(groups[1].shortcuts[2].keys).toEqual(['Shift', 'Тягти']);
  });
});
