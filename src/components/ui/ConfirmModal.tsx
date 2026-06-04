/**
 * ConfirmModal — reusable confirmation dialog.
 *
 * Usage:
 *   <ConfirmModal
 *     title="Remove finding?"
 *     message="This marker will be permanently removed from the viewer."
 *     confirmLabel="Dismiss"
 *     danger
 *     onConfirm={() => doSomething()}
 *     onCancel={() => setOpen(false)}
 *   />
 *
 * Renders into document.body via a portal.
 * Esc and backdrop-click both trigger onCancel.
 */

import { useFocusTrap } from '@/hooks/useFocusTrap';
import { X } from 'lucide-react';
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

// ── Styled components ────────────────────────────────────────────────────────

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
  width: min(400px, 92vw);
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

const Message = styled.p`
  margin: 10px 20px 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-2);
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 18px 20px 20px;
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
    background: rgba(255, 255, 255, 0.06);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.15);
  }
`;

const ConfirmBtn = styled.button<{ $danger?: boolean }>`
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 7px 14px;
  border-radius: 6px;
  cursor: pointer;
  outline: none;
  transition: filter 120ms, opacity 120ms, box-shadow 120ms;

  ${({ $danger }) =>
    $danger
      ? `
    border: 1px solid rgba(224, 82, 82, 0.5);
    background: rgba(224, 82, 82, 0.12);
    color: #e05252;
    &:hover { filter: brightness(1.15); }
    &:focus-visible { box-shadow: 0 0 0 2px rgba(224,82,82,0.35); filter: brightness(1.1); }
  `
      : `
    border: 1px solid var(--amber);
    background: rgba(196, 153, 70, 0.12);
    color: var(--amber);
    &:hover { filter: brightness(1.12); }
    &:focus-visible { box-shadow: 0 0 0 2px rgba(196,153,70,0.35); filter: brightness(1.08); }
  `}
`;

// ── Props ────────────────────────────────────────────────────────────────────

export interface ConfirmModalProps {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red destructive style for the confirm button. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Esc → cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Auto-focus the safe (cancel) button when the modal opens, so that
  // pressing Enter immediately keeps the item — never accidentally destroys
  // it.  Defer with rAF so the focus call lands after the portal mounts
  // and the entry animation begins.
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => cancelBtnRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  // Trap Tab/Shift+Tab navigation inside the dialog so keyboard users can't
  // accidentally tab back to the page underneath.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef);

  return createPortal(
    <Backdrop
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: <explanation> */}
      <Dialog ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <Head>
          <Title id="confirm-modal-title">{title}</Title>
          <CloseBtn type="button" aria-label="Cancel" onClick={onCancel}>
            <X size={16} />
          </CloseBtn>
        </Head>

        {message && <Message>{message}</Message>}

        <Actions>
          <CancelBtn ref={cancelBtnRef} type="button" onClick={onCancel}>
            {cancelLabel}
          </CancelBtn>
          <ConfirmBtn type="button" $danger={danger} onClick={onConfirm}>
            {confirmLabel}
          </ConfirmBtn>
        </Actions>
      </Dialog>
    </Backdrop>,
    document.body,
  );
}
