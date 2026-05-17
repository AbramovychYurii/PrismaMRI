import styled from "styled-components";
import { useVolumeStore } from "@/store";

// ── Styled components ──────────────────────────────────────────────────────

const DisplayCellWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
`;

const SliderRowWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 7px;
`;

const SliderLabelRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
`;

const SliderName = styled.div`
  font-family: var(--serif);
  font-size: 15px;
  color: var(--ink);
  letter-spacing: -0.005em;
  line-height: 1;
`;

const SliderValue = styled.div`
  font-family: var(--mono);
  font-size: 18px;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  letter-spacing: -0.01em;
`;

const HuLabel = styled.span`
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-4);
  font-weight: 400;
  margin-left: 4px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

const SliderHint = styled.div`
  font-family: var(--sans);
  font-size: 11.5px;
  color: var(--ink-3);
  line-height: 1.4;
`;

// ── Sub-components ─────────────────────────────────────────────────────────

interface SliderRowProps {
  name: "Window" | "Level";
  value: number;
  min: number;
  max: number;
  accent: string;
  hint: string;
  onChange: (v: number) => void;
}

function SliderRow({
  name,
  value,
  min,
  max,
  accent,
  hint,
  onChange,
}: SliderRowProps) {
  const span = max - min || 1;
  const fill = `${Math.max(0, Math.min(100, ((value - min) / span) * 100))}%`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange(Number(e.target.value));

  return (
    <SliderRowWrap>
      <SliderLabelRow>
        <SliderName>{name}</SliderName>
        <SliderValue>
          {Math.round(value)}
          <HuLabel>HU</HuLabel>
        </SliderValue>
      </SliderLabelRow>
      <input
        type="range"
        className="wl-slider"
        min={min}
        max={max}
        step={Math.max(1, Math.round(span / 1000))}
        value={value}
        onChange={handleChange}
        style={
          {
            "--accent": accent,
            "--fill": fill,
          } as React.CSSProperties
        }
      />
      <SliderHint>{hint}</SliderHint>
    </SliderRowWrap>
  );
}

export function DisplayCell() {
  const wlDraft = useVolumeStore((s) => s.wlDraft);
  const setWLDraft = useVolumeStore((s) => s.setWLDraft);
  const volume = useVolumeStore((s) => s.volume);

  const scalarMin = volume ? Math.floor(volume.scalarMin) : -1000;
  const scalarMax = volume ? Math.ceil(volume.scalarMax) : 3000;
  const fullSpan = Math.max(1, scalarMax - scalarMin);

  // Drafts drive the 3D contrast live (cheap uniform); the 2D slice recompute
  // is debounced off wlDraft by useWindowLevel (heavy for big volumes).
  function commit(patch: { window?: number; level?: number }) {
    setWLDraft(patch);
  }

  const handleWindowChange = (v: number) => commit({ window: v });
  const handleLevelChange = (v: number) => commit({ level: v });

  return (
    <DisplayCellWrap>
      <SliderRow
        name="Window"
        value={wlDraft.window}
        min={1}
        max={fullSpan}
        accent="var(--amber)"
        hint="Contrast span — narrower window sharpens bone & raises 3D contrast."
        onChange={handleWindowChange}
      />
      <SliderRow
        name="Level"
        value={wlDraft.level}
        min={scalarMin}
        max={scalarMax}
        accent="var(--teal)"
        hint="Brightness center — higher emphasizes dense tissue in 2D & 3D."
        onChange={handleLevelChange}
      />
    </DisplayCellWrap>
  );
}
