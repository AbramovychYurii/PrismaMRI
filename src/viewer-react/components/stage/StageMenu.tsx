import { ThreePreview } from '@prisma-mri/viewer-core';
import { Loader, Share2 } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useHover } from '../../hooks/useHover';
import { useMenuKeyboard } from '../../hooks/useMenuKeyboard';
import { useStageExport } from '../../hooks/useStageExport';
import styles from './StageMenu.module.css';

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
    <button
      className={styles.itemBtn}
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-hover={hover || undefined}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {icon}
      {label}
    </button>
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
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={styles.triggerBtn}
        type="button"
        aria-label={
          recording ? `Recording 3D spin — ${Math.round((recordPct ?? 0) * 100)}%` : 'Stage options'
        }
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={recording}
        data-on={open || recording || undefined}
        data-hover={(hover && !open && !recording) || undefined}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {recording ? <Loader className={styles.spin} size={20} /> : <IconMoreHorizontal />}
      </button>

      {open && (
        <div className={styles.dropdown} ref={menuRef} role="menu" aria-label="Stage options">
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
              <div className={styles.divider} aria-hidden />
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
        </div>
      )}
    </div>
  );
}
