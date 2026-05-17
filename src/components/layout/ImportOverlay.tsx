import { useState } from "react";
import { useVolumeStore } from "@/store/volumeStore";
import { useViewerActions } from "@/hooks/ViewerActionsContext";
import { APP_NAME } from "@/constants";
import { ExamplesSection } from "@/components/layout/ExamplesSection";

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

  return (
    <main
      aria-label="PrismaMRI — import a medical volume"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 40px 24px",
        overflow: "auto",
      }}
    >
      <div style={{ width: 1080, maxWidth: "100%" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr",
            gap: 40,
            alignItems: "center",
          }}
        >
          {/* ── Left column: branding + description ── */}
          <div style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 40 }}>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10.5,
                color: "var(--amber)",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span>{APP_NAME}</span>
              <span
                aria-hidden="true"
                style={{
                  flex: 1,
                  height: 1,
                  background: "var(--rule)",
                  maxWidth: 60,
                }}
              />
            </div>

            <h1
              style={{
                fontFamily: "var(--serif)",
                fontSize: 44,
                lineHeight: 1.05,
                fontWeight: 400,
                letterSpacing: "-0.01em",
                margin: "0 0 10px",
              }}
            >
              A volumetric reader
              <br />
              that{" "}
              <em style={{ fontStyle: "italic", color: "var(--amber)" }}>
                stays
              </em>{" "}
              on your device.
            </h1>

            <p
              style={{
                fontSize: 14,
                color: "var(--ink-3)",
                lineHeight: 1.5,
                maxWidth: 460,
                marginBottom: 16,
              }}
            >
              Drop a DICOM folder, NIfTI bundle, MHA stack, NRRD, or compressed
              archive. Parsing runs in workers; the volume is held in memory
              only for the duration of this session.
            </p>

            <ul
              aria-label="Supported formats"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 10,
              }}
            >
              {FORMATS.map((f) => (
                <li
                  key={f.token}
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10.5,
                    color: "var(--ink-2)",
                    padding: "4px 10px",
                    border: "1px solid var(--rule)",
                    borderRadius: 2,
                    letterSpacing: "0.1em",
                  }}
                >
                  <b style={{ color: "var(--amber)", fontWeight: 500 }}>
                    {f.token}
                  </b>
                  {f.rest}
                </li>
              ))}
            </ul>

            {error ? (
              <p
                role="alert"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--rose)",
                  lineHeight: 1.5,
                  letterSpacing: "0.02em",
                  margin: "0 0 8px",
                }}
              >
                {error}
              </p>
            ) : null}

            {/* ink-3 = 4.7:1 on --bg → passes WCAG AA */}
            <p
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10.5,
                color: "var(--ink-3)",
                lineHeight: 1.5,
                letterSpacing: "0.04em",
                margin: 0,
              }}
            >
              For research and educational use only — not a medical device.
              <br />
              No upload, no cloud, no telemetry. Data never leaves the browser.
            </p>
          </div>

          {/* ── Right column: drop zone ── */}
          <div>
            <div
              role="region"
              aria-label="Drag-and-drop target — drop a volume file here to open it"
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              onDragOver={(e) => {
                e.preventDefault();
                setHover(true);
              }}
              onDragLeave={() => setHover(false)}
              onDrop={handleDrop}
              style={{
                position: "relative",
                minHeight: 280,
                background: hover ? "var(--panel-2)" : "var(--panel)",
                border: `1px dashed ${hover ? "var(--amber)" : "var(--rule-2)"}`,
                borderRadius: 4,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 32,
                transition: "200ms",
                overflow: "hidden",
              }}
            >
              {/* Decorative corner accents */}
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  width: 18,
                  height: 18,
                  border: "1px solid var(--amber)",
                  borderRight: "none",
                  borderBottom: "none",
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  bottom: 8,
                  right: 8,
                  width: 18,
                  height: 18,
                  border: "1px solid var(--amber)",
                  borderLeft: "none",
                  borderTop: "none",
                }}
              />

              <svg
                aria-hidden="true"
                focusable="false"
                width={64}
                height={64}
                viewBox="0 0 64 64"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.4}
                style={{ color: "var(--amber)", marginBottom: 22 }}
              >
                <rect x={10} y={14} width={44} height={36} rx={2} />
                <path d="M10 24h44" />
                <path d="M22 14V8h20v6" />
                <path d="M32 32v12M27 39l5 5 5-5" strokeLinecap="round" />
              </svg>

              {/* Loading status announced to screen readers */}
              <div
                aria-live="polite"
                aria-atomic="true"
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 18,
                  fontWeight: 400,
                  marginBottom: 4,
                  textAlign: "center",
                  lineHeight: 1.3,
                }}
              >
                {loading.active
                  ? loading.message || "Loading…"
                  : "Drop volume to begin"}
              </div>

              <div
                aria-hidden="true"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--ink-3)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 24,
                }}
              >
                {loading.active
                  ? `${loading.percent}%`
                  : "DICOM · NIfTI · MHA · NRRD · ZIP"}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={openFile}
                  aria-label="Open file — browse for a DICOM, NIfTI, MHA, NRRD or ZIP file"
                  style={{
                    padding: "9px 16px",
                    border: "1px solid var(--amber)",
                    borderRadius: 4,
                    background: "var(--amber)",
                    color: "#1a140a",
                    fontWeight: 600,
                    fontFamily: "var(--sans)",
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  Open file
                </button>
                <button
                  type="button"
                  onClick={openFolder}
                  aria-label="Open folder — browse for a DICOM series folder"
                  style={{
                    padding: "9px 16px",
                    border: "1px solid var(--rule-2)",
                    borderRadius: 4,
                    background: "transparent",
                    color: "var(--ink)",
                    fontFamily: "var(--sans)",
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  Open folder
                </button>
              </div>
            </div>
          </div>
        </div>

        <ExamplesSection />
      </div>
    </main>
  );
}
