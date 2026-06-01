import { Tooltip } from '@/components/ui/Tooltip';
import { useHover } from '@/hooks/useHover';
import { useVolumeStore } from '@/store';
import type { RenderPreset } from '@/types';
import styled from 'styled-components';

// ── Slab MIP options shared across all panels (side + fullscreen). ─────────
const SLAB_PRESETS: Array<[string, number]> = [
  ['Off', 0],
  ['3 mm', 3],
  ['5 mm', 5],
  ['10 mm', 10],
];

// ── Styled components ──────────────────────────────────────────────────────

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 9px;
  flex: 1;
`;

const PresetGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
`;

const PresetBtn = styled.button<{ $active: boolean; $hover: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid
    ${({ $active, $hover }) =>
      $active ? 'var(--amber)' : $hover ? 'var(--ink-4)' : 'var(--rule-2)'};
  background: ${({ $active, $hover }) =>
    $active ? 'rgba(196,153,70,0.12)' : $hover ? 'rgba(255,255,255,0.04)' : 'transparent'};
  cursor: pointer;
  text-align: center;
  transition:
    background 80ms,
    border-color 80ms;
`;

const PresetName = styled.span<{ $active: boolean }>`
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ $active }) => ($active ? 'var(--amber)' : 'var(--ink-2)')};
`;

// ── Slab MIP section ───────────────────────────────────────────────────────

/** Mirrors the dock cell heading (HeadTitle + HeadLine in Dock.tsx) so the
 * "Slab MIP" sub-section reads as a peer of "Render Mode" rather than an
 * inline label. */
const SlabHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
`;

const SlabHeadTitle = styled.span`
  font-family: var(--serif);
  font-size: 15px;
  color: var(--ink);
  letter-spacing: 0.005em;
`;

const SlabHeadLine = styled.span`
  flex: 1;
  height: 1px;
  background: var(--rule);
`;

const SlabSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SlabRow = styled.div`
  display: flex;
  gap: 6px;
`;

const SlabBtn = styled.button<{ $active: boolean }>`
  flex: 1;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--amber)' : 'var(--rule-2)')};
  background: ${({ $active }) => ($active ? 'rgba(196,153,70,0.12)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--amber)' : 'var(--ink-2)')};
  cursor: pointer;
  transition:
    background 80ms,
    border-color 80ms,
    color 80ms;

  &:hover {
    ${({ $active }) =>
      !$active &&
      `
      background: rgba(255,255,255,0.04);
      border-color: var(--ink-4);
    `}
  }
`;

// ── Data ───────────────────────────────────────────────────────────────────

const PRESETS: { id: RenderPreset; name: string; desc: string }[] = [
  { id: 'mip', name: 'MIP', desc: 'Max intensity — full range grayscale' },
  { id: 'tissue', name: 'Tissue', desc: 'Fat · muscle · fluid · marrow' },
  { id: 'bone', name: 'Bone', desc: 'Highlights dense bright structures' },
];

// ── Sub-components ─────────────────────────────────────────────────────────

function PresetButton({
  name,
  desc,
  active,
  onClick,
}: {
  name: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}) {
  const { hover, onMouseEnter, onMouseLeave } = useHover();
  return (
    <Tooltip label={desc} above>
      <PresetBtn
        type="button"
        $active={active}
        $hover={hover && !active}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        aria-pressed={active}
        aria-label={`${name} — ${desc}`}
      >
        <PresetName $active={active}>{name}</PresetName>
      </PresetBtn>
    </Tooltip>
  );
}

// ── RenderCell ─────────────────────────────────────────────────────────────

export function RenderCell() {
  const renderPreset = useVolumeStore((s) => s.renderPreset);
  const setRenderPreset = useVolumeStore((s) => s.setRenderPreset);
  const slabMm = useVolumeStore((s) => s.slabMm);
  const setSlabMm = useVolumeStore((s) => s.setSlabMm);

  return (
    <Wrap>
      <PresetGrid>
        {PRESETS.map(({ id, name, desc }) => (
          <PresetButton
            key={id}
            name={name}
            desc={desc}
            active={renderPreset === id}
            onClick={() => setRenderPreset(id)}
          />
        ))}
      </PresetGrid>

      <SlabSection>
        <SlabHead>
          <SlabHeadTitle>Slab MIP</SlabHeadTitle>
          <SlabHeadLine />
        </SlabHead>
        <SlabRow>
          {SLAB_PRESETS.map(([label, mm]) => (
            <SlabBtn
              key={label}
              type="button"
              $active={slabMm === mm}
              onClick={() => setSlabMm(mm)}
              aria-pressed={slabMm === mm}
            >
              {label}
            </SlabBtn>
          ))}
        </SlabRow>
      </SlabSection>
    </Wrap>
  );
}
