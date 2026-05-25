import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

// ── Data ───────────────────────────────────────────────────────────────────

interface ShortcutRow {
  action: string;
  keys: string[];
  /** Alternative gesture shown after a "/" — e.g. touch equivalent. */
  altKeys?: string[];
}

const SECTIONS: Array<{ label: string; rows: ShortcutRow[] }> = [
  {
    label: 'File',
    rows: [
      { keys: ['⌘ / Ctrl', 'O'], action: 'Open folder' },
      { keys: ['Esc'], action: 'Return to import screen' },
    ],
  },
  {
    label: 'Slices',
    rows: [
      { keys: ['Scroll'], action: 'Navigate slices' },
      { keys: ['↑ / ↓'], action: 'Step slice (active plane)' },
      { keys: ['PgUp / PgDn'], action: '±10 slices (scrubber focused)' },
      { keys: ['Home / End'], action: 'First / last slice' },
    ],
  },
  {
    label: '2D Panels',
    rows: [
      { keys: ['Click'], action: 'Activate plane / move crosshair' },
      { keys: ['Right-click'], altKeys: ['Long press'], action: 'Open measure menu' },
    ],
  },
  {
    label: '3D View',
    rows: [
      { keys: ['Drag'], action: 'Orbit' },
      { keys: ['Scroll'], action: 'Zoom' },
    ],
  },
];

// ── Styled components ──────────────────────────────────────────────────────

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9990;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(3px);
`;

const Modal = styled.div`
  position: static;
  background: rgba(12, 10, 7, 0.98);
  border: 1px solid var(--rule-2);
  border-radius: 6px;
  padding: 22px 26px 18px;
  width: min(440px, 92vw);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.8),
    0 0 0 1px rgba(255, 255, 255, 0.04);
`;

const ModalHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
`;

const ModalTitle = styled.h2`
  font-family: var(--serif);
  font-size: 18px;
  font-weight: 400;
  margin: 0;
  color: var(--ink);
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  color: var(--ink-3);
  cursor: pointer;
  padding: 2px;
  line-height: 0;
  &:hover {
    color: var(--ink);
  }
`;

const Section = styled.div`
  & + & {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--rule);
  }
`;

const SectionHead = styled.div`
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--amber);
  margin-bottom: 7px;
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
`;

const Action = styled.span`
  font-family: var(--sans);
  font-size: 12.5px;
  color: var(--ink-2);
`;

const Keys = styled.span`
  display: flex;
  gap: 5px;
  flex-shrink: 0;
  margin-left: 16px;
`;

const Kbd = styled.kbd`
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--rule-2);
  border-radius: 3px;
  padding: 2px 7px;
  line-height: 1.5;
  white-space: nowrap;
`;

const KeyDivider = styled.span`
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-4);
  user-select: none;
`;

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export function KeyboardShortcutsModal({ onClose }: Props) {
  return createPortal(
    <Backdrop
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Modal as="dialog" open aria-label="Keyboard shortcuts">
        <ModalHead>
          <ModalTitle>Keyboard shortcuts</ModalTitle>
          <CloseBtn type="button" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </CloseBtn>
        </ModalHead>

        {SECTIONS.map((s) => (
          <Section key={s.label}>
            <SectionHead>{s.label}</SectionHead>
            {s.rows.map((r) => (
              <Row key={r.action}>
                <Action>{r.action}</Action>
                <Keys>
                  {r.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                  {r.altKeys && (
                    <>
                      <KeyDivider>/</KeyDivider>
                      {r.altKeys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </>
                  )}
                </Keys>
              </Row>
            ))}
          </Section>
        ))}
      </Modal>
    </Backdrop>,
    document.body,
  );
}
