import { intensityUnit } from '@prisma-mri/viewer-core';
import { useViewerStore } from '../../viewer';
import styles from './StudyCell.module.css';

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function Row({ k, v, dim }: { k: string; v: string; dim?: string }) {
  return (
    <>
      <div className={styles.rowKey}>{k}</div>
      <div className={styles.rowValue}>
        {v}
        {dim && <span className={styles.rowDim}>{` ${dim}`}</span>}
      </div>
    </>
  );
}

export function StudyCell() {
  const volume = useViewerStore((s) => s.volume);
  const unit = intensityUnit(volume?.meta.modality);
  const meta = volume?.meta;

  const voxelCount = meta?.dims ? meta.dims[0] * meta.dims[1] * meta.dims[2] : 0;
  const bytesPerVoxel = volume?.voxels.BYTES_PER_ELEMENT ?? 2;
  const bytes = voxelCount * bytesPerVoxel;

  return (
    <div className={styles.studyGrid}>
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
            ? `${Math.round(volume.scalarMin)} → ${Math.round(volume.scalarMax)}${unit ? ` ${unit}` : ''}`
            : '—'
        }
      />
      <Row k="Source" v={volume ? 'Local · in-memory' : '—'} />
    </div>
  );
}
