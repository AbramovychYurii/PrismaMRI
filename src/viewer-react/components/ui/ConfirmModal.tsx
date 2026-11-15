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

import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { isTopLayer } from '../../hooks/layers';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import styles from './ConfirmModal.module.css';

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

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Esc → cancel, but only for the topmost dialog on the page: with two
  // viewers open, Esc closes the newest one, not both.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopLayer(dialogRef.current)) onCancel();
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
  useFocusTrap(dialogRef);

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: a backdrop click cancels; Esc is the keyboard path (handled above)
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={styles.dialog}
        ref={dialogRef}
        // biome-ignore lint/a11y/useSemanticElements: a <dialog> would bring its own top layer and backdrop; this one is positioned by the backdrop above
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.head}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>
          <button className={styles.closeBtn} type="button" aria-label="Cancel" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>

        {message && <p className={styles.message}>{message}</p>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} ref={cancelBtnRef} type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={styles.confirmBtn}
            type="button"
            data-danger={danger || undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
