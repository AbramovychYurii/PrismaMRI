import styled from "styled-components";

// ── Styled components ──────────────────────────────────────────────────────

const TickScaleWrap = styled.div`
  position: absolute;
  left: 60px;
  right: 60px;
  bottom: 26px;
  height: 18px;
  display: flex;
  align-items: flex-end;
  pointer-events: none;
`;

// ── Component ──────────────────────────────────────────────────────────────

export function TickScale() {
  const ticks: { x: number; major: boolean }[] = [];
  for (let i = 0; i <= 50; i++) {
    ticks.push({ x: (i / 50) * 1000, major: i % 5 === 0 });
  }

  return (
    <TickScaleWrap>
      {/* Keep the SVG as-is — it's a data visualization, not a UI icon */}
      <svg
        viewBox="0 0 1000 18"
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%", color: "var(--ink-4)" }}
      >
        <g stroke="currentColor" strokeWidth={1} fill="none">
          <line x1={0} y1={0} x2={1000} y2={0} opacity={0.5} />
          <g>
            {ticks.map((t, i) => (
              <line
                key={i}
                x1={t.x}
                y1={0}
                x2={t.x}
                y2={t.major ? 6 : 3}
                stroke="currentColor"
                opacity={t.major ? 0.7 : 0.4}
              />
            ))}
          </g>
        </g>
        <g
          fill="currentColor"
          fontFamily="IBM Plex Mono, monospace"
          fontSize={8}
          opacity={0.7}
        >
          <text x={0} y={17}>
            −255
          </text>
          <text x={245} y={17}>
            −128
          </text>
          <text x={495} y={17}>
            0
          </text>
          <text x={735} y={17}>
            +128
          </text>
          <text x={965} y={17}>
            +255
          </text>
        </g>
      </svg>
    </TickScaleWrap>
  );
}
