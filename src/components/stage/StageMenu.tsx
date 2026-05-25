import { useHover } from '@/hooks/useHover';
import type { ThreePreview } from '@/lib/volume/three-preview';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

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
  background: rgba(18, 16, 10, 0.97);
  backdrop-filter: blur(16px);
  border: 1px solid var(--rule-2);
  border-radius: 8px;
  padding: 4px;
  min-width: 200px;
  z-index: 20;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65);
`;

const ItemBtn = styled.button<{ $hover: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 11px;
  background: ${({ $hover }) => ($hover ? 'rgba(255,255,255,0.05)' : 'transparent')};
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

export function StageMenu({ previewRef }: Props) {
  const [open, setOpen] = useState(false);
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

  function handleExport3D() {
    setOpen(false);
    previewRef.current
      ?.exportPNG()
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'prismamri-3d.png';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(console.error);
  }

  return (
    <Wrap ref={wrapRef}>
      <TriggerBtn
        type="button"
        aria-label="Stage options"
        aria-expanded={open}
        $on={open}
        $hover={hover && !open}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <IconMoreHorizontal />
      </TriggerBtn>

      {open && (
        <Dropdown>
          <MenuItem
            icon={<IconDownload />}
            label="Export 3D view as PNG"
            onClick={handleExport3D}
          />
        </Dropdown>
      )}
    </Wrap>
  );
}
