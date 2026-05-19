import { useVolumeStore } from '@/store';
import styled from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const StudyGrid = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  row-gap: 5px;
  column-gap: 14px;
  align-items: baseline;
  flex: 1;
`;

const RowKey = styled.div`
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-4);
  text-transform: uppercase;
  letter-spacing: 0.14em;
`;

const RowValue = styled.div`
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

const RowDim = styled.span`
  color: var(--ink-3);
`;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function Row({ k, v, dim }: { k: string; v: string; dim?: string }) {
  return (
    <>
      <RowKey>{k}</RowKey>
      <RowValue>
        {v}
        {dim && <RowDim>{` ${dim}`}</RowDim>}
      </RowValue>
    </>
  );
}

export function StudyCell() {
  const volume = useVolumeStore((s) => s.volume);
  const meta = volume?.meta;

  const voxelCount = meta?.dims ? meta.dims[0] * meta.dims[1] * meta.dims[2] : 0;
  const bytesPerVoxel = volume?.voxels.BYTES_PER_ELEMENT ?? 2;
  const bytes = voxelCount * bytesPerVoxel;

  return (
    <StudyGrid>
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
        v={volume ? `${Math.round(volume.scalarMin)} → ${Math.round(volume.scalarMax)} HU` : '—'}
      />
      <Row k="Source" v={volume ? 'Local · in-memory' : '—'} />
    </StudyGrid>
  );
}
