import { useVolumeStore } from '@/store/volumeStore';

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
          <span style={axisStyle('var(--amber)')}>
            <i style={iStyle('var(--amber)')}>x</i>
            {cursor ? cursor.x : '—'}
          </span>
          <span style={axisStyle('var(--violet)')}>
            <i style={iStyle('var(--violet)')}>y</i>
            {cursor ? cursor.y : '—'}
          </span>
          <span style={axisStyle('var(--azure)')}>
            <i style={iStyle('var(--azure)')}>z</i>
            {cursor ? cursor.z : '—'}
          </span>
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
