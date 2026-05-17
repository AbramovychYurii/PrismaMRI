import styled from "styled-components";
import { useVolumeStore } from "@/store/volumeStore";

// ── Styled components ──────────────────────────────────────────────────────

const StripGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: center;
`;

const RunCellWrap = styled.div<{ $last?: boolean }>`
  padding: 6px 18px;
  border-right: ${({ $last }) => ($last ? "none" : "1px solid var(--rule)")};
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
`;

const RunKey = styled.div`
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--ink-4);
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

// ── Sub-components ─────────────────────────────────────────────────────────

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
  const meta = volume?.meta;
  const dims = meta?.dims;
  const spacing = meta?.spacing;

  return (
    <StripGrid>
      <RunCell k="Scanner" v={meta?.scanner ?? "—"} />
      <RunCell
        k="Volume"
        v={dims ? `${dims[0]} × ${dims[1]} × ${dims[2]}` : "—"}
        dim={dims ? "vox" : undefined}
      />
      <RunCell
        k="Spacing"
        v={spacing ? spacing.map((s) => s.toFixed(2)).join(" × ") : "—"}
        dim={spacing ? "mm" : undefined}
      />
      <RunCell
        k="Modality"
        v={meta?.modality ?? "—"}
        dim={
          meta?.bitsAllocated ? `· ${meta.bitsAllocated}-bit · HU` : undefined
        }
        last
      />
    </StripGrid>
  );
}
