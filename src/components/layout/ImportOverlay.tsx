/**
 * ImportOverlay — full-screen drop target shown when no volume is loaded.
 *
 * Drag a folder / file in, or click Open file / Open folder. Also renders the
 * marketing landing copy on the left column and the curated examples below.
 *
 * All visual styling lives in `ImportOverlay.styles.ts`.
 */

import { ExamplesSection } from '@/components/layout/ExamplesSection';
import { APP_NAME } from '@/constants';
import { useViewerActions } from '@/hooks';
import { type FsEntry, collectFilesFromEntry } from '@/lib/import/scan-folder';
import { useVolumeStore } from '@/store';
import { FolderOpen } from 'lucide-react';
import { useState } from 'react';
import {
  ButtonsRow,
  ContentWrap,
  CornerAccentBR,
  CornerAccentTL,
  DescParagraph,
  DisclaimerText,
  DropZone,
  ErrorMsg,
  FormatItem,
  FormatList,
  FormatToken,
  ImportMain,
  LeftCol,
  LoadingSubText,
  LoadingTitle,
  MainTitle,
  PrimaryButton,
  SecondaryButton,
  TagLine,
  TagRule,
  TitleAccent,
  TwoColGrid,
} from './ImportOverlay.styles';

// ── Data ───────────────────────────────────────────────────────────────────

const FORMATS = [
  { token: 'DCM', rest: ' series' },
  { token: 'NII', rest: ' · nii.gz' },
  { token: 'MHA', rest: ' · mhd' },
  { token: 'NRRD', rest: '' },
  { token: 'ZIP', rest: '' },
];

const STAGE_LABEL: Record<string, string> = {
  scanning: 'Scanning',
  'parsing-headers': 'Parsing headers',
  'reading-files': 'Reading files',
  assembling: 'Assembling',
  'preparing-3d': 'Building 3D',
};

/**
 * Stages whose `current / total` is a voxel count, an arbitrary 0..100 ratio,
 * or a stale value inherited from the previous stage — the raw number is
 * meaningless to the user, so we show only the stage label (the percent is
 * rendered separately under the title).  DICOM `reading-files` / `parsing-
 * headers` keep their "(45 / 200)" counter because there it's a real slice
 * count.
 */
const HIDE_COUNTER_STAGES = new Set(['scanning', 'reading-files', 'assembling', 'preparing-3d']);

function formatLoadingTitle(loading: {
  stage: string;
  current: number;
  total: number;
  message: string;
}): string {
  const label = STAGE_LABEL[loading.stage] ?? 'Loading';
  if (HIDE_COUNTER_STAGES.has(loading.stage)) {
    return label;
  }
  if (loading.total > 1 && loading.current > 0) {
    return `${label} (${loading.current} / ${loading.total})`;
  }
  return loading.message || 'Loading…';
}

// ── Stable inline-style references ──────────────────────────────────────────

const FOLDER_OPEN_ICON_STYLE: React.CSSProperties = {
  color: 'var(--amber)',
  marginBottom: 22,
};

// ── Component ──────────────────────────────────────────────────────────────

export function ImportOverlay() {
  const [hover, setHover] = useState(false);
  const error = useVolumeStore((s) => s.error);
  const loading = useVolumeStore((s) => s.loading);
  const { openFiles, openFolder, openFile, cancelLoad } = useViewerActions();

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setHover(false);

    const entries = Array.from(e.dataTransfer.items)
      .map((item) => item.webkitGetAsEntry?.() as unknown as FsEntry | null)
      .filter((entry): entry is FsEntry => entry !== null);

    if (entries.length > 0) {
      const files: File[] = [];
      for (const entry of entries) {
        await collectFilesFromEntry(entry, '', files);
      }
      if (files.length > 0) {
        openFiles(files);
        return;
      }
    }

    if (e.dataTransfer.files.length > 0) openFiles(e.dataTransfer.files);
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(true);
  };

  return (
    <ImportMain aria-label="PrismaMRI — import a medical volume">
      <ContentWrap>
        <TwoColGrid>
          <LeftCol>
            <TagLine>
              <span>{APP_NAME}</span>
              <TagRule aria-hidden="true" />
            </TagLine>

            <MainTitle>
              An MRI reader
              <br />
              that <TitleAccent>stays</TitleAccent> on your device.
            </MainTitle>

            <DescParagraph>
              Drop a DICOM folder, NIfTI bundle, MHA stack, NRRD, or compressed archive. Parsing
              runs in workers; the volume is held in memory only for the duration of this session.
            </DescParagraph>

            <FormatList aria-label="Supported formats">
              {FORMATS.map((f) => (
                <FormatItem key={f.token}>
                  <FormatToken>{f.token}</FormatToken>
                  {f.rest}
                </FormatItem>
              ))}
            </FormatList>

            {error ? <ErrorMsg role="alert">{error}</ErrorMsg> : null}

            {/* ink-3 = 4.7:1 on --bg → passes WCAG AA */}
            <DisclaimerText>
              For research and educational use only — not a medical device.
              <br />
              No upload, no cloud, no telemetry. Data never leaves the browser.
            </DisclaimerText>
          </LeftCol>

          {/* ── Drop zone ── */}
          <div>
            <DropZone
              as="section"
              aria-label="Drag-and-drop target — drop a volume file here to open it"
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              onDragOver={handleDragOver}
              onDragLeave={() => setHover(false)}
              onDrop={handleDrop}
              $hover={hover}
            >
              <CornerAccentTL aria-hidden="true" />
              <CornerAccentBR aria-hidden="true" />

              <FolderOpen
                aria-hidden="true"
                focusable={false}
                size={64}
                strokeWidth={0.75}
                style={FOLDER_OPEN_ICON_STYLE}
              />

              <LoadingTitle aria-live="polite" aria-atomic="true">
                {loading.active ? formatLoadingTitle(loading) : 'Drop MRI to begin'}
              </LoadingTitle>

              <LoadingSubText aria-hidden="true">
                {loading.active ? `${loading.percent}%` : 'DICOM · NIfTI · MHA · NRRD · ZIP'}
              </LoadingSubText>

              <ButtonsRow>
                {loading.active ? (
                  <SecondaryButton type="button" onClick={cancelLoad} aria-label="Cancel loading">
                    Cancel
                  </SecondaryButton>
                ) : (
                  <>
                    <PrimaryButton
                      type="button"
                      onClick={openFile}
                      aria-label="Open file — browse for a DICOM, NIfTI, MHA, NRRD or ZIP file"
                    >
                      Open file
                    </PrimaryButton>
                    <SecondaryButton
                      type="button"
                      onClick={openFolder}
                      aria-label="Open folder — browse for a DICOM series folder"
                    >
                      Open folder
                    </SecondaryButton>
                  </>
                )}
              </ButtonsRow>
            </DropZone>
          </div>
        </TwoColGrid>

        <ExamplesSection />
      </ContentWrap>
    </ImportMain>
  );
}
