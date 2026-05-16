import { useVolumeStore } from '@/store/volumeStore';

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function Row({ k, v, dim }: { k: string; v: string; dim?: string }) {
  return (
    <>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--ink-4)',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
        }}
      >
        {k}
      </div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 12,
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0,
        }}
      >
        {v}
        {dim && <span style={{ color: 'var(--ink-3)' }}>{` ${dim}`}</span>}
      </div>
    </>
  );
}

export function StudyCell() {
  const volume = useVolumeStore((s) => s.volume);
  const meta = volume?.meta;

  const voxelCount =
    meta?.dims ? meta.dims[0] * meta.dims[1] * meta.dims[2] : 0;
  const bytes = voxelCount * 2;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        rowGap: 5,
        columnGap: 14,
        alignItems: 'baseline',
        flex: 1,
      }}
    >
      <Row k="ID" v={meta?.studyId ?? '—'} />
      <Row k="Acquired" v={meta?.acquired ?? '—'} />
      <Row k="Protocol" v={meta?.protocol ?? '—'} />
      <Row
        k="Voxels"
        v={voxelCount ? voxelCount.toLocaleString('en-US').replace(/,/g, ' ') : '—'}
        dim={voxelCount ? `· ${formatBytes(bytes)}` : undefined}
      />
      <Row
        k="Range"
        v={
          volume
            ? `${Math.round(volume.scalarMin)} → ${Math.round(volume.scalarMax)} HU`
            : '—'
        }
      />
      <Row k="Source" v={volume ? 'Local · in-memory' : '—'} />
    </div>
  );
}
