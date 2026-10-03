import { useHover } from '@/hooks/useHover';
import { useMenuKeyboard } from '@/hooks/useMenuKeyboard';
import { useStageExport } from '@/hooks/useStageExport';
import { ThreePreview } from '@/lib/volume/three-preview';
import { Loader, Share2 } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';

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

const Divider = styled.div`
  height: 1px;
  margin: 4px 6px;
  background: var(--rule);
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
      role="menuitem"
      tabIndex={-1}
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

interface Props {
  previewRef: React.MutableRefObject<ThreePreview | null>;
}

/** Captured once: whether this browser can record the canvas to video at all. */
const CAN_RECORD_VIDEO = ThreePreview.canRecordVideo();

/** Real video extension on this browser ('webm', or 'mp4' on Safari) — shown
 *  in the export/share labels so the format matches what the user receives. */
const VIDEO_EXT = ThreePreview.videoFileExt() ?? 'webm';

/**
 * Captured once: whether the Web Share API can share files here. True mostly on
 * mobile (iOS/Android) and a few desktop browsers; false on most desktops, so
 * the share items stay hidden there instead of dead-ending. Probed with a tiny
 * real file because `canShare({ files })` is content-aware.
 */
const CAN_SHARE_FILES = (() => {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
    const probe = new File([new Uint8Array([0])], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
})();

export function StageMenu({ previewRef }: Props) {
  const [open, setOpen] = useState(false);
  const { recordPct, exportImage, exportVideo } = useStageExport(previewRef);
  const { hover, onMouseEnter, onMouseLeave } = useHover();
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useMenuKeyboard(menuRef, close, open);

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

  function handleExport3D() {
    setOpen(false);
    exportImage('download');
  }

  function handleExportVideo() {
    setOpen(false);
    void exportVideo('download');
  }

  function handleShare3D() {
    setOpen(false);
    exportImage('share');
  }

  function handleShareVideo() {
    setOpen(false);
    void exportVideo('share');
  }

  const recording = recordPct !== null;

  return (
    <Wrap ref={wrapRef}>
      <TriggerBtn
        type="button"
        aria-label={
          recording ? `Recording 3D spin — ${Math.round((recordPct ?? 0) * 100)}%` : 'Stage options'
        }
        aria-haspopup="menu"
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
        <Dropdown ref={menuRef} role="menu" aria-label="Stage options">
          <MenuItem
            icon={<IconDownload />}
            label="Export 3D view (.png)"
            onClick={handleExport3D}
          />
          {CAN_RECORD_VIDEO && (
            <MenuItem
              icon={<IconVideo />}
              label={`Export 3D spin (.${VIDEO_EXT})`}
              onClick={handleExportVideo}
            />
          )}
          {CAN_SHARE_FILES && (
            <>
              <Divider aria-hidden />
              <MenuItem
                icon={<Share2 size={14} />}
                label="Share 3D view (.png)"
                onClick={handleShare3D}
              />
              {CAN_RECORD_VIDEO && (
                <MenuItem
                  icon={<Share2 size={14} />}
                  label={`Share 3D spin (.${VIDEO_EXT})`}
                  onClick={handleShareVideo}
                />
              )}
            </>
          )}
        </Dropdown>
      )}
    </Wrap>
  );
}
