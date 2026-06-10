import { useHover } from '@/hooks/useHover';
import { ThreePreview } from '@/lib/volume/three-preview';
import { Loader } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const Wrap = styled.div`
  position: relative;
`;

const TriggerBtn = styled.button<{ $on: boolean; $hover: boolean }>`
  background: ${({ $on, $hover }) =>
    $on ? 'rgba(255,181,71,0.08)' : $hover ? 'rgba(28,24,18,0.92)' : 'rgba(20,18,14,0.85)'};
  backdrop-filter: blur(8px);
  border: 1px solid ${({ $on }) => ($on ? 'var(--amber-dim)' : 'var(--rule)')};
  border-radius: 999px;
  padding: 12px 12px;
  color: ${({ $on, $hover }) => ($on ? 'var(--amber)' : $hover ? 'var(--ink)' : 'var(--ink-2)')};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: 120ms;
  -webkit-tap-highlight-color: transparent;

  @media (max-width: 767px) {
    padding: 14px 14px;
    min-width: 44px;
    min-height: 44px;
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--surface-glass);
  backdrop-filter: blur(16px);
  border: 1px solid var(--rule-2);
  border-radius: 8px;
  padding: 4px;
  min-width: 200px;
  z-index: var(--z-dock-ui);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65);
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const SpinIcon = styled(Loader)`
  animation: ${spin} 700ms linear infinite;
`;

const ItemBtn = styled.button<{ $hover: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 11px;
  background: ${({ $hover }) => ($hover ? 'var(--highlight-sm)' : 'transparent')};
  border: none;
  border-radius: 5px;
  color: ${({ $hover }) => ($hover ? 'var(--ink)' : 'var(--ink-2)')};
  font-family: var(--sans);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  transition:
    background 80ms,
    color 80ms;
  min-height: 32px;
`;

// ── Icons ──────────────────────────────────────────────────────────────────

function IconMoreHorizontal() {
  return (
    <svg viewBox="0 0 20 20" width={20} height={20} fill="currentColor" aria-hidden="true">
      <circle cx={3} cy={10} r={2} />
      <circle cx={10} cy={10} r={2} />
      <circle cx={17} cy={10} r={2} />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconVideo() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 8-6 4 6 4V8Z" />
      <rect x={2} y={6} width={14} height={12} rx={2} ry={2} />
    </svg>
  );
}

// ── MenuItem ───────────────────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  const { hover, onMouseEnter, onMouseLeave } = useHover();
  return (
    <ItemBtn
      type="button"
      $hover={hover}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {icon}
      {label}
    </ItemBtn>
  );
}

// ── StageMenu ──────────────────────────────────────────────────────────────

interface Props {
  previewRef: React.MutableRefObject<ThreePreview | null>;
}

/** Captured once: whether this browser can record the canvas to video at all. */
const CAN_RECORD_VIDEO = ThreePreview.canRecordVideo();

export function StageMenu({ previewRef }: Props) {
  const [open, setOpen] = useState(false);
  // Recording progress 0..1 while a turntable video renders, else null.
  const [recordPct, setRecordPct] = useState<number | null>(null);
  const { hover, onMouseEnter, onMouseLeave } = useHover();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExport3D() {
    setOpen(false);
    previewRef.current
      ?.exportPNG()
      .then((blob) => triggerDownload(blob, 'prismamri-3d.png'))
      .catch(console.error);
  }

  async function handleExportVideo() {
    setOpen(false);
    const preview = previewRef.current;
    if (!preview || recordPct !== null) return;
    setRecordPct(0);
    try {
      const { blob, ext } = await preview.exportRotationVideo({
        onProgress: (t) => setRecordPct(t),
      });
      triggerDownload(blob, `prismamri-3d-spin.${ext}`);
    } catch (err) {
      console.error(err);
    } finally {
      setRecordPct(null);
    }
  }

  const recording = recordPct !== null;

  return (
    <Wrap ref={wrapRef}>
      <TriggerBtn
        type="button"
        aria-label={
          recording ? `Recording 3D spin — ${Math.round((recordPct ?? 0) * 100)}%` : 'Stage options'
        }
        aria-expanded={open}
        disabled={recording}
        $on={open || recording}
        $hover={hover && !open && !recording}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {recording ? <SpinIcon size={20} /> : <IconMoreHorizontal />}
      </TriggerBtn>

      {open && (
        <Dropdown>
          <MenuItem
            icon={<IconDownload />}
            label="Export 3D view as PNG"
            onClick={handleExport3D}
          />
          {CAN_RECORD_VIDEO && (
            <MenuItem
              icon={<IconVideo />}
              label="Export 3D spin as video"
              onClick={handleExportVideo}
            />
          )}
        </Dropdown>
      )}
    </Wrap>
  );
}
