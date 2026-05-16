import { useVolumeStore } from '@/store/volumeStore';
import { ACCENT_VAR, AXIS_ACCENT, type Axis } from '@/constants';

const axisStyle = (color: string): React.CSSProperties => ({
  color,
  display: 'flex',
  gap: 4,
  alignItems: 'baseline',
});
const iStyle = (color: string): React.CSSProperties => ({
  fontStyle: 'italic',
  fontFamily: 'var(--serif)',
  fontSize: 13,
  color,
  marginRight: 1,
});

const AXES: Axis[] = ['x', 'y', 'z'];

export function NavigationCell() {
  const cursor = useVolumeStore((s) => s.cursor);

  return (
    <>
      <div style={{ fontFamily: 'var(--mono)', marginBottom: 12, lineHeight: 1.3 }}>
        <span
          style={{
            fontSize: 10,
            color: 'var(--ink-4)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginBottom: 4,
            display: 'block',
          }}
        >
          Cursor · voxel
        </span>
        <span
          style={{
            fontSize: 16,
            color: 'var(--ink)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 500,
            display: 'flex',
            gap: 14,
          }}
        >
          {AXES.map((a) => {
            const c = ACCENT_VAR[AXIS_ACCENT[a]];
            return (
              <span key={a} style={axisStyle(c)}>
                <i style={iStyle(c)}>{a}</i>
                {cursor ? cursor[a] : '—'}
              </span>
            );
          })}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>
        <div style={{ marginBottom: 6 }}>
          <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Drag</b> any plane to scrub linked
          slices.
        </div>
        <div style={{ marginBottom: 6 }}>
          <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Wheel</b> to zoom ·{' '}
          <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Shift+drag</b> to pan.
        </div>
        <div>
          <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>↑ ↓</b> step the active plane by 1
          slice.
        </div>
      </div>
    </>
  );
}
