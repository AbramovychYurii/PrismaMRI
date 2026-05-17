import { useState } from "react";
import styled from "styled-components";
import { useViewerActions } from "@/hooks";
import { useVolumeStore } from "@/store";

// ── Types ──────────────────────────────────────────────────────────────────

interface ExampleMeta {
  id: string;
  file: string;
  title: string;
  subtitle: string;
  dims: string;
  spacing: string;
  size: string;
  description: string;
  tag: string;
  thumbnail: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL;

// In dev the Vite plugin serves /examples/*.nrrd locally.
// On GitHub Pages, LFS files must be fetched from GitHub's media CDN.
const NRRD_BASE = import.meta.env.DEV
  ? ""
  : "https://media.githubusercontent.com/media/AbramovychYurii/PrismaMRI/main";

const EXAMPLES: ExampleMeta[] = [
  {
    id: "maxillofacial_CBCT",
    file: "maxillofacial_CBCT.nrrd",
    title: "Maxilla",
    subtitle: "upper jaw",
    dims: "401 × 401 × 201",
    spacing: "0.25 mm",
    size: "32 MB",
    description: "Upper jaw — high-resolution dental CT.",
    tag: "CT",
    thumbnail: `${BASE}examples/thumbnails/maxillofacial_CBCT.jpg`,
  },
  {
    id: "dog_frontal_thorax_injured_paw_CT",
    file: "dog_frontal_thorax_injured_paw_CT.nrrd",
    title: "Canine",
    subtitle: "thorax",
    dims: "512 × 512 × 459",
    spacing: "0.73 mm",
    size: "131 MB",
    description: "Canine forequarters with injured front paw.",
    tag: "CT",
    thumbnail: `${BASE}examples/thumbnails/dog_frontal_thorax_injured_paw.jpg`,
  },
  {
    id: "full_body",
    file: "full_body.nrrd",
    title: "Full body",
    subtitle: "torso + pelvis",
    dims: "512 × 512 × 996",
    spacing: "0.83 mm",
    size: "290 MB",
    description: "Whole-body scan — sagittal view.",
    tag: "CT",
    thumbnail: `${BASE}examples/thumbnails/full_body.png`,
  },
];

// ── Styled components ──────────────────────────────────────────────────────

const ExamplesSectionWrap = styled.section`
  width: 100%;
  margin-top: 48px;
  border-top: 1px solid var(--rule);
  padding-top: 24px;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const SectionTitle = styled.h2`
  font-family: var(--serif);
  font-style: italic;
  font-size: 15px;
  font-weight: 400;
  color: var(--ink);
  margin: 0;
`;

const SectionLabel = styled.span`
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--ink-3);
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

const CardList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
`;

const CardButton = styled.button<{ $disabled: boolean; $hover: boolean }>`
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: ${({ $hover }) => ($hover ? "var(--panel-2)" : "var(--panel)")};
  border: 1px solid ${({ $hover }) => ($hover ? "var(--amber)" : "var(--rule)")};
  border-radius: 4px;
  overflow: hidden;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  text-align: left;
  padding: 0;
  opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};
  transition:
    border-color 150ms,
    background 150ms,
    opacity 150ms;
  box-shadow: ${({ $hover }) =>
    $hover ? "0 0 0 1px rgba(255,181,71,0.08)" : "none"};
`;

const CornerTL = styled.span<{ $hover: boolean }>`
  position: absolute;
  top: 8px;
  left: 8px;
  width: 14px;
  height: 14px;
  border-top: 1px solid var(--amber);
  border-left: 1px solid var(--amber);
  opacity: ${({ $hover }) => ($hover ? 1 : 0.5)};
  transition: opacity 150ms;
  z-index: 2;
  pointer-events: none;
`;

const CornerTR = styled.span`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 14px;
  height: 14px;
  border-top: 1px solid var(--rule-2);
  border-right: 1px solid var(--rule-2);
  z-index: 2;
  pointer-events: none;
`;

const ModalityBadge = styled.span`
  position: absolute;
  top: 10px;
  right: 10px;
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--ink-2);
  background: rgba(12, 11, 9, 0.8);
  border: 1px solid var(--rule);
  border-radius: 2px;
  padding: 2px 5px;
  z-index: 3;
`;

const ThumbnailWrap = styled.div`
  width: 100%;
  aspect-ratio: 1;
  background: #0a0907;
  overflow: hidden;
  flex-shrink: 0;
`;

const ThumbnailImg = styled.img<{ $hover: boolean }>`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  filter: ${({ $hover }) =>
    $hover ? "brightness(1.1) contrast(1.05)" : "brightness(0.95)"};
  transition: filter 150ms;
`;

const CardMeta = styled.div`
  padding: 10px 12px 12px;
`;

const CardTitle = styled.div`
  font-family: var(--serif);
  font-size: 14px;
  font-weight: 400;
  color: var(--ink);
  margin-bottom: 1px;
`;

const CardSubtitle = styled.em`
  font-style: italic;
  color: var(--ink-3);
  margin-left: 6px;
  font-size: 13px;
`;

const CardDims = styled.div`
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-3);
  letter-spacing: 0.04em;
  margin-bottom: 4px;
`;

const CardDesc = styled.div`
  font-family: var(--sans);
  font-size: 11px;
  color: var(--ink-3);
  line-height: 1.4;
`;

// ── Sub-components ─────────────────────────────────────────────────────────

function ExampleCard({
  example,
  onLoad,
  disabled,
}: {
  example: ExampleMeta;
  onLoad: () => void;
  disabled: boolean;
}) {
  const [hover, setHover] = useState(false);
  const interactive = !disabled;
  const showHover = interactive && hover;

  const handleMouseEnter = () => interactive && setHover(true);
  const handleMouseLeave = () => setHover(false);

  return (
    <CardButton
      type="button"
      disabled={disabled}
      onClick={onLoad}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={`Load ${example.title} (${example.subtitle}) — ${example.dims} · ${example.spacing} · ${example.size}`}
      $disabled={disabled}
      $hover={showHover}
    >
      {/* Decorative corner brackets */}
      <CornerTL aria-hidden="true" $hover={showHover} />
      <CornerTR aria-hidden="true" />

      {/* Modality badge — ink-2 = 8.9:1 contrast on dark overlay → passes WCAG AA */}
      <ModalityBadge aria-label={`Modality: ${example.tag}`}>
        {example.tag}
      </ModalityBadge>

      {/* Thumbnail — fixed height, no aspect-ratio stretch */}
      <ThumbnailWrap>
        <ThumbnailImg
          src={example.thumbnail}
          alt=""
          aria-hidden="true"
          $hover={showHover}
        />
      </ThumbnailWrap>

      {/* Meta — visible text, aria-label on button provides full context */}
      <CardMeta aria-hidden="true">
        <CardTitle>
          {example.title}
          <CardSubtitle>· {example.subtitle}</CardSubtitle>
        </CardTitle>
        {/* ink-3 = 4.7:1 on --panel → passes WCAG AA */}
        <CardDims>
          {example.dims} · {example.spacing} · {example.size}
        </CardDims>
        <CardDesc>{example.description}</CardDesc>
      </CardMeta>
    </CardButton>
  );
}

export function ExamplesSection() {
  const { loadFromUrl } = useViewerActions();
  const examplesDisabled = useVolumeStore((s) => s.loading.active);

  const handleLoad = (ex: ExampleMeta) => () =>
    loadFromUrl(`${NRRD_BASE}/examples/${ex.file}`, ex.file);

  return (
    <ExamplesSectionWrap aria-label="Example CT datasets">
      {/* Section header */}
      <SectionHeader>
        <SectionTitle>Examples</SectionTitle>
        <SectionLabel aria-hidden="true">
          {examplesDisabled ? "Loading…" : "Pre-loaded · Click to open"}
        </SectionLabel>
      </SectionHeader>

      {/* Cards */}
      <CardList role="list">
        {EXAMPLES.map((ex) => (
          <li key={ex.id}>
            <ExampleCard
              example={ex}
              disabled={examplesDisabled}
              onLoad={handleLoad(ex)}
            />
          </li>
        ))}
      </CardList>
    </ExamplesSectionWrap>
  );
}
