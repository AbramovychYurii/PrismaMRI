import { ACCENT_VAR, AXIS_ACCENT, type Axis } from '@/constants';
import { useVolumeStore } from '@/store';
import styled from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const CursorSection = styled.div`
  font-family: var(--mono);
  margin-bottom: 12px;
  line-height: 1.3;
`;

const CursorLabel = styled.span`
  font-size: 10px;
  color: var(--ink-3);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 4px;
  display: block;
`;

const CursorValues = styled.span`
  font-size: 16px;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  display: flex;
  gap: 14px;
`;

const AxisSpan = styled.span<{ $color: string }>`
  color: ${({ $color }) => $color};
  display: flex;
  gap: 4px;
  align-items: baseline;
`;

const AxisLabel = styled.i<{ $color: string }>`
  font-style: italic;
  font-family: var(--serif);
  font-size: 13px;
  color: ${({ $color }) => $color};
  margin-right: 1px;
`;

const TipsSection = styled.div`
  font-size: 11.5px;
  color: var(--ink-3);
  line-height: 1.45;
`;

const TipRow = styled.div`
  margin-bottom: 6px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const TipKey = styled.b`
  color: var(--ink-2);
  font-weight: 500;
`;

// ── Constants ──────────────────────────────────────────────────────────────

const AXES: Axis[] = ['x', 'y', 'z'];

export function NavigationCell() {
  const cursor = useVolumeStore((s) => s.cursor);

  return (
    <>
      <CursorSection>
        <CursorLabel>Cursor · voxel</CursorLabel>
        <CursorValues>
          {AXES.map((a) => {
            const c = ACCENT_VAR[AXIS_ACCENT[a]];
            return (
              <AxisSpan key={a} $color={c}>
                <AxisLabel $color={c}>{a}</AxisLabel>
                {cursor ? cursor[a] : '—'}
              </AxisSpan>
            );
          })}
        </CursorValues>
      </CursorSection>
      <TipsSection>
        <TipRow>
          <TipKey>Drag</TipKey> any plane to scrub linked slices.
        </TipRow>
        <TipRow>
          <TipKey>Wheel</TipKey> to zoom · <TipKey>Shift+drag</TipKey> to pan.
        </TipRow>
        <TipRow>
          <TipKey>↑ ↓</TipKey> step the active plane by 1 slice.
        </TipRow>
      </TipsSection>
    </>
  );
}
