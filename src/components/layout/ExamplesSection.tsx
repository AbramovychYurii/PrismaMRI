import { AuroraSparkles } from '@/components/ui/AuroraSparkles';
import { useViewerActions } from '@/hooks';
import { useHover } from '@/hooks/useHover';
import { useVolumeStore } from '@/store';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

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
  /** Has a pre-recorded AI report available via the SessionPanel demo button. */
  hasAiReport?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL;

// In dev the Vite plugin serves /examples/*.nrrd locally.
// On GitHub Pages, LFS files must be fetched from GitHub's media CDN.
const NRRD_BASE = import.meta.env.DEV
  ? ''
  : 'https://media.githubusercontent.com/media/AbramovychYurii/PrismaMRI/main';

const EXAMPLES: ExampleMeta[] = [
  {
    id: 'maxillofacial_CBCT',
    file: 'maxillofacial_CBCT.nrrd',
    title: 'Maxilla',
    subtitle: 'upper jaw',
    dims: '401 × 401 × 201',
    spacing: '0.25 mm',
    size: '32 MB',
    description: 'Upper jaw — high-resolution dental CT.',
    tag: 'CT',
    thumbnail: `${BASE}examples/thumbnails/maxillofacial_CBCT.jpg`,
    hasAiReport: true,
  },
  {
    id: 'dog_frontal_thorax_injured_paw_CT',
    file: 'dog_frontal_thorax_injured_paw_CT.nrrd',
    title: 'Canine',
    subtitle: 'thorax',
    dims: '512 × 512 × 459',
    spacing: '0.73 mm',
    size: '131 MB',
    description: 'Canine forequarters with injured front paw.',
    tag: 'CT',
    thumbnail: `${BASE}examples/thumbnails/dog_frontal_thorax_injured_paw.jpg`,
  },
  {
    id: 'head_neck_mri',
    file: 'Yurii_Abramovych_Head_Neck_DICOM.zip',
    title: 'Head & neck',
    subtitle: 'my own MRI',
    dims: '256–512 px',
    spacing: '11 series',
    size: '11 MB',
    description: 'Personal head/neck MRI — brain, C-spine and neck series; coarse spacing.',
    tag: 'MRI',
    thumbnail: `${BASE}examples/thumbnails/head_neck_mri.png`,
  },
  {
    id: 'full_body',
    file: 'full_body.nrrd',
    title: 'Full body',
    subtitle: 'torso + pelvis',
    dims: '512 × 512 × 996',
    spacing: '0.83 mm',
    size: '290 MB',
    description: 'Whole-body scan — sagittal view.',
    tag: 'CT',
    thumbnail: `${BASE}examples/thumbnails/full_body.png`,
  },
];

// ── Styled components ──────────────────────────────────────────────────────

const ExamplesSectionWrap = styled.section`
  width: 100%;
  margin-top: 36px;
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
  font-size: 18px;
  font-weight: 400;
  color: var(--ink);
  margin: 0;

  @media (max-width: 767px) {
    font-style: normal;
  }
`;

const SectionLabel = styled.span`
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--ink-3);
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

// Slider viewport — holds the scroll track plus the overlaid nav arrows.
const SliderViewport = styled.div`
  position: relative;
`;

const CardList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: stretch;
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }

  /* Three cards visible at a time on desktop; the rest scroll into view.
     The li is itself a flex box so the inner card stretches to the tallest
     row height — every card lines up regardless of description length. */
  & > li {
    flex: 0 0 calc((100% - 24px) / 3);
    scroll-snap-align: start;
    display: flex;
  }

  @media (max-width: 767px) {
    padding-bottom: 8px;
    & > li { flex-basis: 72vw; }
  }
`;

// Circular prev/next controls, vertically centred over the card row.
const NavArrow = styled.button<{ $side: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  ${({ $side }) => ($side === 'left' ? 'left: -16px;' : 'right: -16px;')}
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--panel-2);
  border: 1px solid var(--rule-2);
  color: var(--ink);
  cursor: pointer;
  z-index: var(--z-overlay-local);
  opacity: 1;
  transition: opacity 150ms, border-color 150ms, background 150ms;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);

  &:hover { border-color: var(--amber); background: var(--panel); }
  &:disabled {
    opacity: 0;
    pointer-events: none;
  }

  /* Touch devices swipe — hide the arrows there. */
  @media (max-width: 767px) {
    display: none;
  }
`;

const CardButton = styled.button<{ $disabled: boolean; $hover: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: ${({ $hover }) => ($hover ? 'var(--panel-2)' : 'var(--panel)')};
  border: 1px solid ${({ $hover }) => ($hover ? 'var(--amber)' : 'var(--rule)')};
  border-radius: 4px;
  overflow: hidden;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  text-align: left;
  padding: 0;
  opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};
  transition:
    border-color 150ms,
    background 150ms,
    opacity 150ms;
  box-shadow: ${({ $hover }) => ($hover ? '0 0 0 1px rgba(255,181,71,0.08)' : 'none')};
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
  z-index: var(--z-overlay-local);
  pointer-events: none;
`;

const CornerTR = styled.span<{ $hover: boolean }>`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 14px;
  height: 14px;
  border-top: 1px solid var(--amber);
  border-right: 1px solid var(--amber);
  opacity: ${({ $hover }) => ($hover ? 1 : 0.5)};
  transition: opacity 150ms;
  z-index: var(--z-overlay-local);
  pointer-events: none;
`;

const ModalityBadge = styled.span`
  position: absolute;
  top: 16px;
  right: 16px;
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--ink-2);
  background: var(--surface-glass);
  border: 1px solid var(--rule);
  border-radius: 2px;
  padding: 2px 5px;
  z-index: var(--z-panel-header);
`;

const AiBadge = styled.span`
  position: absolute;
  top: 16px;
  right: 50px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.12em;
  color: #50c878;
  background: rgba(80, 200, 120, 0.08);
  border: 1px solid rgba(80, 200, 120, 0.35);
  border-radius: 2px;
  padding: 2px 5px;
  z-index: var(--z-panel-header);
  transition: background 150ms, border-color 150ms;
  &:hover {
    background: rgba(80, 200, 120, 0.16);
    border-color: rgba(80, 200, 120, 0.6);
  }
`;

// Custom tooltip — appears instantly on hover (native title= has a ~700 ms delay).
const AiTooltip = styled.span`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 220px;
  padding: 8px 10px;
  background: rgba(14, 12, 9, 0.96);
  border: 1px solid var(--rule-2);
  border-radius: 4px;
  font-family: var(--mono);
  font-size: 9.5px;
  line-height: 1.5;
  letter-spacing: 0.02em;
  color: var(--ink-2);
  text-transform: none;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition: opacity 80ms, transform 80ms;
  z-index: calc(var(--z-panel-header) + 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);

  ${AiBadge}:hover & {
    opacity: 1;
    transform: translateY(0);
  }
`;

const ThumbnailWrap = styled.div`
  width: 100%;
  aspect-ratio: 1;
  background: var(--surface-deep);
  overflow: hidden;
  flex-shrink: 0;
`;

const ThumbnailImg = styled.img<{ $hover: boolean }>`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  filter: ${({ $hover }) => ($hover ? 'brightness(1.1) contrast(1.05)' : 'brightness(0.95)')};
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
  const { hover, onMouseEnter, onMouseLeave } = useHover();
  const showHover = !disabled && hover;

  return (
    <CardButton
      type="button"
      disabled={disabled}
      onClick={onLoad}
      onMouseEnter={disabled ? undefined : onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-label={`Load ${example.title} (${example.subtitle}) — ${example.dims} · ${example.spacing} · ${example.size}`}
      $disabled={disabled}
      $hover={showHover}
    >
      {/* Decorative corner brackets */}
      <CornerTL aria-hidden="true" $hover={showHover} />
      <CornerTR aria-hidden="true" $hover={showHover} />

      {/* AI report availability — only when a pre-recorded example exists for this file */}
      {example.hasAiReport && (
        <AiBadge
          aria-label="Includes pre-recorded AI report"
          // Swallow clicks so the badge doesn't trigger the card's onClick
          // (which would load the volume).  The badge is informational only.
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <AuroraSparkles size={10} strokeWidth={1.8} />
          AI
          <AiTooltip role="tooltip">
            Includes a pre-recorded AI analysis. Open the example and click “Show example AI report”
            in the AI Agent panel to load the findings.
          </AiTooltip>
        </AiBadge>
      )}

      {/* Modality badge — ink-2 = 8.9:1 contrast on dark overlay → passes WCAG AA */}
      <ModalityBadge aria-label={`Modality: ${example.tag}`}>{example.tag}</ModalityBadge>

      {/* Thumbnail — fixed height, no aspect-ratio stretch */}
      <ThumbnailWrap>
        <ThumbnailImg src={example.thumbnail} alt="" aria-hidden="true" $hover={showHover} />
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

  const trackRef = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  // Recompute arrow availability from the track's scroll position.
  const syncArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 1);
    setCanNext(el.scrollLeft < maxScroll - 1);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    syncArrows();
    el.addEventListener('scroll', syncArrows, { passive: true });
    const ro = new ResizeObserver(syncArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', syncArrows);
      ro.disconnect();
    };
  }, [syncArrows]);

  // Scroll by roughly one card (track width / 3) in the given direction.
  const scrollByCard = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth / 3 + 12), behavior: 'smooth' });
  };

  const handleLoad = (ex: ExampleMeta) => () =>
    loadFromUrl(`${NRRD_BASE}/examples/${ex.file}`, ex.file);

  return (
    <ExamplesSectionWrap aria-label="Example datasets">
      {/* Section header */}
      <SectionHeader>
        <SectionTitle>Examples</SectionTitle>
        <SectionLabel aria-hidden="true">
          {examplesDisabled ? 'Loading…' : 'Pre-loaded · Click to open'}
        </SectionLabel>
      </SectionHeader>

      {/* Slider */}
      <SliderViewport>
        <NavArrow
          type="button"
          $side="left"
          onClick={() => scrollByCard(-1)}
          disabled={!canPrev}
          aria-label="Previous examples"
        >
          <ChevronLeft size={18} strokeWidth={1.75} />
        </NavArrow>

        <CardList ref={trackRef}>
          {EXAMPLES.map((ex) => (
            <li key={ex.id}>
              <ExampleCard example={ex} disabled={examplesDisabled} onLoad={handleLoad(ex)} />
            </li>
          ))}
        </CardList>

        <NavArrow
          type="button"
          $side="right"
          onClick={() => scrollByCard(1)}
          disabled={!canNext}
          aria-label="More examples"
        >
          <ChevronRight size={18} strokeWidth={1.75} />
        </NavArrow>
      </SliderViewport>
    </ExamplesSectionWrap>
  );
}
