import { useVolumeStore } from '@/store';
import styled from 'styled-components';

const StripGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: center;
`;

const RunCellWrap = styled.div<{ $last?: boolean }>`
  padding: 6px 18px;
  border-right: ${({ $last }) => ($last ? 'none' : '1px solid var(--rule)')};
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
`;

const RunKey = styled.div`
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--ink-3);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 3px;
`;

const RunVal = styled.div`
  font-family: var(--mono);
  font-size: 12.5px;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RunDim = styled.span`
  color: var(--ink-3);
`;

const MeasureVal = styled(RunVal)`
  font-size: 13px;
  font-weight: 700;
`;

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
    <RunCellWrap $last={last}>
      <RunKey>{k}</RunKey>
      <RunVal>
        {v}
        {dim && <RunDim>{` ${dim}`}</RunDim>}
      </RunVal>
    </RunCellWrap>
  );
}

export function RunStrip() {
  const volume = useVolumeStore((s) => s.volume);
  const measurement = useVolumeStore((s) => s.measurement);
  const meta = volume?.meta;
  const dims = meta?.dims;
  const spacing = meta?.spacing;

  let measureValue: string;
  let measureDim: string | undefined;
  if (!measurement) {
    measureValue = '—';
  } else if (measurement.distanceMm !== null) {
    measureValue = measurement.distanceMm.toFixed(1);
    measureDim = 'mm';
  } else {
    measureValue = 'Set endpoint';
  }

  return (
    <StripGrid>
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
      />
      <RunCellWrap $last>
        <RunKey>Measure</RunKey>
        {measurement?.distanceMm !== null && measurement !== null ? (
          <MeasureVal>
            {measureValue}
            {measureDim && <>{` ${measureDim}`}</>}
          </MeasureVal>
        ) : (
          <RunVal>{measureValue}</RunVal>
        )}
      </RunCellWrap>
    </StripGrid>
  );
}
