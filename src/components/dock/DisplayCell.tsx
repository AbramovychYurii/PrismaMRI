import { useVolumeStore } from '@/store/volumeStore';

interface SliderRowProps {
  name: 'Window' | 'Level';
  value: number;
  min: number;
  max: number;
  accent: string;
  hint: string;
  onChange: (v: number) => void;
}

function SliderRow({ name, value, min, max, accent, hint, onChange }: SliderRowProps) {
  const span = max - min || 1;
  const fill = `${Math.max(0, Math.min(100, ((value - min) / span) * 100))}%`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 15,
            color: 'var(--ink)',
            letterSpacing: '-0.005em',
            lineHeight: 1,
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--ink)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
            letterSpacing: '-0.01em',
          }}
        >
          {Math.round(value)}
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--ink-4)',
              fontWeight: 400,
              marginLeft: 4,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            HU
          </span>
        </div>
      </div>
      <input
        type="range"
        className="wl-slider"
        min={min}
        max={max}
        step={Math.max(1, Math.round(span / 1000))}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            '--accent': accent,
            '--fill': fill,
          } as React.CSSProperties
        }
      />
      <div
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 11.5,
          color: 'var(--ink-3)',
          lineHeight: 1.4,
        }}
      >
        {hint}
      </div>
    </div>
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
      <SliderRow
        name="Window"
        value={wlDraft.window}
        min={1}
        max={fullSpan}
        accent="var(--amber)"
        hint="Contrast span — narrower window sharpens bone & raises 3D contrast."
        onChange={(v) => commit({ window: v })}
      />
      <SliderRow
        name="Level"
        value={wlDraft.level}
        min={scalarMin}
        max={scalarMax}
        accent="var(--teal)"
        hint="Brightness center — higher emphasizes dense tissue in 2D & 3D."
        onChange={(v) => commit({ level: v })}
      />
    </div>
  );
}
