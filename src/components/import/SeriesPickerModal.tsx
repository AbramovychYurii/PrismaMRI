/**
 * SeriesPickerModal — shown when an imported DICOM folder/zip holds more than
 * one series. Lets the user pick which acquisition to open; stacking them into
 * one grid would produce an incoherent volume, so exactly one is assembled.
 *
 * Renders into document.body via a portal. Esc and backdrop-click cancel.
 */

import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { SeriesChoice } from '@/lib/import/types';
import { Layers, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';

// ── Animations ──────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const scaleIn = keyframes`
  from { transform: scale(0.95) translateY(6px); opacity: 0; }
  to   { transform: scale(1)    translateY(0);   opacity: 1; }
`;

// ── Styled components ─────────────────────────────────────────────────────────

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  background: var(--surface-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(3px);
  animation: ${fadeIn} 140ms ease;
`;

const Dialog = styled.div`
  background: var(--surface-glass);
  border: 1px solid var(--rule-2);
  border-radius: 10px;
  width: min(440px, 92vw);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.85),
    0 0 0 1px var(--highlight-xs);
  font-family: var(--mono);
  overflow: hidden;
  animation: ${scaleIn} 160ms cubic-bezier(0.22, 1, 0.36, 1);
`;

const Head = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 0;
`;

const TitleWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
`;

const Title = styled.h2`
  margin: 0;
  font-family: var(--serif);
  font-size: 17px;
  font-weight: 400;
  color: var(--ink);
  line-height: 1.3;
`;

const CloseBtn = styled.button`
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--ink-3);
  line-height: 0;
  margin-top: 1px;
  &:hover { color: var(--ink); }
`;

const Subhead = styled.p`
  margin: 8px 20px 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--ink-2);
`;

const List = styled.div`
  margin: 14px 14px 6px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Row = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: 7px;
  border: 1px solid var(--rule-2);
  background: rgba(255, 255, 255, 0.015);
  color: var(--ink);
  cursor: pointer;
  outline: none;
  transition: border-color 100ms, background 100ms, box-shadow 100ms;

  &:hover {
    border-color: var(--amber);
    background: rgba(196, 153, 70, 0.08);
  }
  &:focus-visible {
    border-color: var(--amber);
    box-shadow: 0 0 0 2px rgba(196, 153, 70, 0.35);
  }
`;

const RowMain = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const RowLabel = styled.span`
  font-size: 12.5px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RowMeta = styled.span`
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: var(--ink-3);
  text-transform: uppercase;
`;

const Count = styled.span`
  flex-shrink: 0;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--amber);
  white-space: nowrap;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: 10px 20px 18px;
`;

const CancelBtn = styled.button`
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid var(--rule-2);
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
  outline: none;
  transition: border-color 100ms, color 100ms, background 100ms, box-shadow 100ms;
  &:hover {
    border-color: var(--ink-4);
    color: var(--ink);
    background: rgba(255, 255, 255, 0.04);
  }
  &:focus-visible {
    border-color: var(--ink);
    color: var(--ink);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.15);
  }
`;

// ── Props ──────────────────────────────────────────────────────────────────

export interface SeriesPickerModalProps {
  series: SeriesChoice[];
  /** Called with the chosen series key. */
  onSelect: (key: string) => void;
  /** Called when the user dismisses the picker (Esc, backdrop, Cancel, ✕). */
  onCancel: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function SeriesPickerModal({ series, onSelect, onCancel }: SeriesPickerModalProps) {
  // Esc → cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Focus the first (largest) series so Enter opens the most likely choice.
  const firstRowRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => firstRowRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef);

  return createPortal(
    <Backdrop
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: portal dialog */}
      <Dialog ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="series-picker-title">
        <Head>
          <TitleWrap>
            <Layers size={16} color="var(--amber)" aria-hidden="true" />
            <Title id="series-picker-title">Choose a series</Title>
          </TitleWrap>
          <CloseBtn type="button" aria-label="Cancel" onClick={onCancel}>
            <X size={16} />
          </CloseBtn>
        </Head>

        <Subhead>
          This import holds {series.length} series. Pick one to open — they have different
          orientations or contrasts and can't share a single volume.
        </Subhead>

        <List>
          {series.map((s, i) => {
            const meta = [s.modality, s.orientation, `${s.columns}×${s.rows}`]
              .filter(Boolean)
              .join(' · ');
            return (
              <Row
                key={s.key}
                ref={i === 0 ? firstRowRef : undefined}
                type="button"
                onClick={() => onSelect(s.key)}
              >
                <RowMain>
                  <RowLabel>{s.label}</RowLabel>
                  <RowMeta>{meta}</RowMeta>
                </RowMain>
                <Count>{s.count} slices</Count>
              </Row>
            );
          })}
        </List>

        <Actions>
          <CancelBtn type="button" onClick={onCancel}>
            Cancel
          </CancelBtn>
        </Actions>
      </Dialog>
    </Backdrop>,
    document.body,
  );
}
