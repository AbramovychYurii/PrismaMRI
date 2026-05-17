import { useState } from "react";
import styled from "styled-components";
import { FolderOpen } from "lucide-react";
import { useVolumeStore } from "@/store";
import { useViewerActions } from "@/hooks";
import { APP_NAME } from "@/constants";
import { ExamplesSection } from "@/components/layout/ExamplesSection";

// ── Types ──────────────────────────────────────────────────────────────────

const FORMATS = [
  { token: "DCM", rest: " series" },
  { token: "NII", rest: " · nii.gz" },
  { token: "MHA", rest: " · mhd" },
  { token: "NRRD", rest: "" },
  { token: "ZIP", rest: "" },
];

interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  file: (cb: (f: File) => void) => void;
  createReader: () => {
    readEntries: (cb: (entries: FsEntry[]) => void) => void;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function collectFromEntry(
  entry: FsEntry,
  path: string,
  out: File[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res) => entry.file(res));
    Object.defineProperty(file, "webkitRelativePath", {
      value: path ? `${path}/${file.name}` : file.name,
      configurable: true,
    });
    out.push(file);
    return;
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const readBatch = () =>
      new Promise<FsEntry[]>((res) => reader.readEntries(res));
    let batch = await readBatch();
    while (batch.length > 0) {
      for (const e of batch) {
        await collectFromEntry(
          e,
          path
            ? `${path}/${(e as unknown as { name: string }).name}`
            : (e as unknown as { name: string }).name,
          out,
        );
      }
      batch = await readBatch();
    }
  }
}

// ── Styled components ──────────────────────────────────────────────────────

const ImportMain = styled.main`
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 40px 24px;
  overflow: auto;
`;

const ContentWrap = styled.div`
  width: 1080px;
  max-width: 100%;
`;

const TwoColGrid = styled.div`
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 40px;
  align-items: center;
`;

const LeftCol = styled.div`
  border-left: 1px solid var(--rule);
  padding-left: 40px;
`;

const TagLine = styled.div`
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--amber);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const TagRule = styled.span`
  flex: 1;
  height: 1px;
  background: var(--rule);
  max-width: 60px;
`;

const MainTitle = styled.h1`
  font-family: var(--serif);
  font-size: 44px;
  line-height: 1.05;
  font-weight: 400;
  letter-spacing: -0.01em;
  margin: 0 0 10px;
`;

const TitleAccent = styled.em`
  font-style: italic;
  color: var(--amber);
`;

const DescParagraph = styled.p`
  font-size: 14px;
  color: var(--ink-3);
  line-height: 1.5;
  max-width: 460px;
  margin-bottom: 16px;
`;

const FormatList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
`;

const FormatItem = styled.li`
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink-2);
  padding: 4px 10px;
  border: 1px solid var(--rule);
  border-radius: 2px;
  letter-spacing: 0.1em;
`;

const FormatToken = styled.b`
  color: var(--amber);
  font-weight: 500;
`;

const ErrorMsg = styled.p`
  font-family: var(--mono);
  font-size: 11px;
  color: var(--rose);
  line-height: 1.5;
  letter-spacing: 0.02em;
  margin: 0 0 8px;
`;

const DisclaimerText = styled.p`
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink-3);
  line-height: 1.5;
  letter-spacing: 0.04em;
  margin: 0;
`;

const DropZone = styled.div<{ $hover: boolean }>`
  position: relative;
  min-height: 280px;
  background: ${({ $hover }) => ($hover ? "var(--panel-2)" : "var(--panel)")};
  border: 1px dashed
    ${({ $hover }) => ($hover ? "var(--amber)" : "var(--rule-2)")};
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  transition: 200ms;
  overflow: hidden;
`;

const CornerAccentTL = styled.span`
  position: absolute;
  top: 8px;
  left: 8px;
  width: 18px;
  height: 18px;
  border: 1px solid var(--amber);
  border-right: none;
  border-bottom: none;
`;

const CornerAccentBR = styled.span`
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 18px;
  height: 18px;
  border: 1px solid var(--amber);
  border-left: none;
  border-top: none;
`;

const LoadingTitle = styled.div`
  font-family: var(--serif);
  font-size: 18px;
  font-weight: 400;
  margin-bottom: 4px;
  text-align: center;
  line-height: 1.3;
`;

const LoadingSubText = styled.div`
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 24px;
`;

const ButtonsRow = styled.div`
  display: flex;
  gap: 8px;
`;

const PrimaryButton = styled.button`
  padding: 9px 16px;
  border: 1px solid var(--amber);
  border-radius: 4px;
  background: var(--amber);
  color: #1a140a;
  font-weight: 600;
  font-family: var(--sans);
  font-size: 12.5px;
  cursor: pointer;
`;

const SecondaryButton = styled.button`
  padding: 9px 16px;
  border: 1px solid var(--rule-2);
  border-radius: 4px;
  background: transparent;
  color: var(--ink);
  font-family: var(--sans);
  font-size: 12.5px;
  cursor: pointer;
`;

// ── Component ──────────────────────────────────────────────────────────────

export function ImportOverlay() {
  const [hover, setHover] = useState(false);
  const error = useVolumeStore((s) => s.error);
  const loading = useVolumeStore((s) => s.loading);
  const { openFiles, openFolder, openFile } = useViewerActions();

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setHover(false);
    const items = Array.from(e.dataTransfer.items);
    const entries = items
      .map((it) => it.webkitGetAsEntry?.() as unknown as FsEntry | null)
      .filter((x): x is FsEntry => !!x);
    if (entries.length > 0) {
      const files: File[] = [];
      for (const entry of entries) {
        await collectFromEntry(entry, "", files);
      }
      if (files.length > 0) {
        openFiles(files);
        return;
      }
    }
    if (e.dataTransfer.files.length > 0) openFiles(e.dataTransfer.files);
  }

  const handleMouseEnter = () => setHover(true);
  const handleMouseLeave = () => setHover(false);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(true);
  };
  const handleDragLeave = () => setHover(false);

  return (
    <ImportMain aria-label="PrismaMRI — import a medical volume">
      <ContentWrap>
        <TwoColGrid>
          {/* ── Left column: branding + description ── */}
          <LeftCol>
            <TagLine>
              <span>{APP_NAME}</span>
              <TagRule aria-hidden="true" />
            </TagLine>

            <MainTitle>
              A volumetric reader
              <br />
              that <TitleAccent>stays</TitleAccent> on your device.
            </MainTitle>

            <DescParagraph>
              Drop a DICOM folder, NIfTI bundle, MHA stack, NRRD, or compressed
              archive. Parsing runs in workers; the volume is held in memory
              only for the duration of this session.
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

          {/* ── Right column: drop zone ── */}
          <div>
            <DropZone
              role="region"
              aria-label="Drag-and-drop target — drop a volume file here to open it"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              $hover={hover}
            >
              {/* Decorative corner accents */}
              <CornerAccentTL aria-hidden="true" />
              <CornerAccentBR aria-hidden="true" />

              <FolderOpen
                aria-hidden="true"
                focusable={false}
                size={64}
                style={{ color: "var(--amber)", marginBottom: 22 }}
              />

              {/* Loading status announced to screen readers */}
              <LoadingTitle aria-live="polite" aria-atomic="true">
                {loading.active
                  ? loading.message || "Loading…"
                  : "Drop volume to begin"}
              </LoadingTitle>

              <LoadingSubText aria-hidden="true">
                {loading.active
                  ? `${loading.percent}%`
                  : "DICOM · NIfTI · MHA · NRRD · ZIP"}
              </LoadingSubText>

              <ButtonsRow>
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
              </ButtonsRow>
            </DropZone>
          </div>
        </TwoColGrid>

        <ExamplesSection />
      </ContentWrap>
    </ImportMain>
  );
}
