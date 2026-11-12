import { useViewerHost, useViewerStore } from '@/viewer';
import { ChevronLeft } from 'lucide-react';
import styled from 'styled-components';

const BackButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 9px 14px;
  border: 1px solid var(--rule-2);
  border-radius: 4px;
  background: transparent;
  color: var(--ink);
  font-family: var(--sans);
  font-size: 12.5px;
  cursor: pointer;
  transition: 120ms;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const Disclaimer = styled.div`
  margin-top: 10px;
  font-family: var(--sans);
  font-size: 10.5px;
  color: var(--ink-3);
  line-height: 1.4;
  padding-top: 8px;
  border-top: 1px dashed var(--rule);

  /* Alone when the host offers no way back. */
  &:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }
`;

const DisclaimerBold = styled.b`
  color: var(--ink-2);
`;

export function SessionCell() {
  const { onExit } = useViewerHost();
  const volume = useViewerStore((s) => s.volume);

  return (
    <>
      {onExit && (
        <BackButton type="button" onClick={onExit} disabled={!volume}>
          <ChevronLeft size={13} />
          Back to import
        </BackButton>
      )}
      <Disclaimer>
        <DisclaimerBold>Reference only.</DisclaimerBold> Not for diagnosis, treatment planning,
        measurements, or implant workflows.
      </Disclaimer>
    </>
  );
}
