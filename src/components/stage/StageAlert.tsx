/**
 * StageAlert — the viewer's error message. Failures that happen while a volume
 * is open (switching series, exporting the 3-D view) set the store's `error`,
 * which until now only the import screen showed, so they went unseen here.
 *
 * Sits top-centre over the stage, between the series switcher and the toolbar
 * pill, on the same layer as that chrome. Text is the import screen's error
 * style (ImportOverlay's ErrorMsg); the dismiss button is ConfirmModal's.
 */

import { useVolumeStore } from '@/store/volumeStore';
import { X } from 'lucide-react';
import styled from 'styled-components';

const Bar = styled.div`
  position: absolute;
  top: 22px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-panel-chrome);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 40%;
  padding: 8px 8px 8px 14px;
  background: var(--surface-glass);
  border: 1px solid var(--rule-2);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65);

  @media (max-width: 767px) {
    /* Full width, below the corner chrome: its 12px inset + the 50px toolbar
       buttons (14px padding either side of a 20px icon, 1px borders) + 8px. */
    top: 70px;
    left: 12px;
    right: 12px;
    transform: none;
    max-width: none;
  }
`;

const Message = styled.p`
  font-family: var(--mono);
  font-size: 11px;
  color: var(--rose);
  line-height: 1.5;
  letter-spacing: 0.02em;
  margin: 0;
`;

const DismissBtn = styled.button`
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--ink-3);
  line-height: 0;
  margin-top: 1px;
  &:hover {
    color: var(--ink);
  }

  @media (max-width: 767px) {
    /* The 44px touch target the stage chrome beside it uses. */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    margin: -8px -8px -8px 0;
  }
`;

export function StageAlert() {
  const error = useVolumeStore((s) => s.error);
  const setError = useVolumeStore((s) => s.setError);
  if (!error) return null;

  return (
    <Bar>
      <Message role="alert">{error}</Message>
      <DismissBtn type="button" aria-label="Close" onClick={() => setError(null)}>
        <X size={16} />
      </DismissBtn>
    </Bar>
  );
}
