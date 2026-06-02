import { useVolumeStore } from '@/store';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const BackButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
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

const BackButtonInner = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 10px;
`;

const KbdTag = styled.span`
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-3);
  border: 1px solid var(--rule-2);
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.05em;

  @media (max-width: 767px) {
    display: none;
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
`;

const DisclaimerBold = styled.b`
  color: var(--ink-2);
`;

export function SessionCell() {
  const navigate = useNavigate();
  const volume = useVolumeStore((s) => s.volume);

  return (
    <>
      <BackButton type="button" onClick={() => navigate('/')} disabled={!volume}>
        <BackButtonInner>
          <ChevronLeft size={13} />
          Back to import
        </BackButtonInner>
        <KbdTag>Esc</KbdTag>
      </BackButton>
      <Disclaimer>
        <DisclaimerBold>Reference only.</DisclaimerBold> Not for diagnosis, treatment planning,
        measurements, or implant workflows.
      </Disclaimer>
    </>
  );
}
