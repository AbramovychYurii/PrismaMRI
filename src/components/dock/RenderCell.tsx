import { useHover } from '@/hooks/useHover';
import { useVolumeStore } from '@/store';
import type { RenderPreset } from '@/types';
import styled from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
`;

const PresetGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
`;

const PresetBtn = styled.button<{ $active: boolean; $hover: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 8px 10px 9px;
  border-radius: 4px;
  border: 1px solid
    ${({ $active, $hover }) =>
      $active ? 'var(--amber)' : $hover ? 'var(--ink-4)' : 'var(--rule-2)'};
  background: ${({ $active, $hover }) =>
    $active ? 'rgba(196,153,70,0.12)' : $hover ? 'rgba(255,255,255,0.04)' : 'transparent'};
  cursor: pointer;
  text-align: left;
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

const PresetDesc = styled.span`
  font-family: var(--sans);
  font-size: 10px;
  color: var(--ink-3);
  line-height: 1.3;
`;

const Hint = styled.p`
  font-family: var(--sans);
  font-size: 11px;
  color: var(--ink-3);
  line-height: 1.4;
  margin: 0;
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
    <PresetBtn
      type="button"
      $active={active}
      $hover={hover && !active}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-pressed={active}
    >
      <PresetName $active={active}>{name}</PresetName>
      <PresetDesc>{desc}</PresetDesc>
    </PresetBtn>
  );
}

// ── RenderCell ─────────────────────────────────────────────────────────────

export function RenderCell() {
  const renderPreset = useVolumeStore((s) => s.renderPreset);
  const setRenderPreset = useVolumeStore((s) => s.setRenderPreset);

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

      <Hint>
        {renderPreset === 'mip'
          ? 'MIP projects the brightest voxel along each ray.'
          : renderPreset === 'tissue'
            ? 'Colour-maps tissue types by signal intensity. Phong shading enabled.'
            : 'Renders only the highest-intensity structures. Phong shading enabled.'}
      </Hint>
    </Wrap>
  );
}
