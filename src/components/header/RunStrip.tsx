import { useVolumeStore } from '@/store/volumeStore';

function RunCell({
  k,
  v,
  dim,
  last,
}: {
  k: string;
  v: string;
  dim?: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: '6px 18px',
        borderRight: last ? 'none' : '1px solid var(--rule)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 9.5,
          color: 'var(--ink-4)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginBottom: 3,
        }}
      >
        {k}
      </div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 12.5,
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {v}
        {dim && <span style={{ color: 'var(--ink-3)' }}>{` ${dim}`}</span>}
      </div>
    </div>
  );
}

export function RunStrip() {
  const volume = useVolumeStore((s) => s.volume);
  const meta = volume?.meta;
  const dims = meta?.dims;
  const spacing = meta?.spacing;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        alignItems: 'center',
      }}
    >
      <RunCell k="Scanner" v={meta?.scanner ?? '—'} />
      <RunCell
        k="Volume"
        v={dims ? `${dims[0]} × ${dims[1]} × ${dims[2]}` : '—'}
        dim={dims ? 'vox' : undefined}
      />
      <RunCell
        k="Spacing"
        v={spacing ? spacing.map((s) => s.toFixed(2)).join(' × ') : '—'}
        dim={spacing ? 'mm' : undefined}
      />
      <RunCell
        k="Modality"
        v={meta?.modality ?? '—'}
        dim={meta?.bitsAllocated ? `· ${meta.bitsAllocated}-bit · HU` : undefined}
        last
      />
    </div>
  );
}
