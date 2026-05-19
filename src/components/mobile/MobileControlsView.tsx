import { DisplayCell } from '@/components/dock/DisplayCell';
import { RenderCell } from '@/components/dock/RenderCell';
import { SessionCell } from '@/components/dock/SessionCell';
import { StudyCell } from '@/components/dock/StudyCell';
import styled from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const ScrollWrap = styled.div`
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 0 env(safe-area-inset-bottom, 0px);
`;

const Section = styled.section`
  padding: 20px 20px 0;
  border-bottom: 1px solid var(--rule);

  &:last-child {
    border-bottom: none;
    padding-bottom: 24px;
  }
`;

const SectionHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
`;

const SectionTitle = styled.h2`
  font-family: var(--serif);
  font-size: 15px;
  font-weight: 400;
  color: var(--ink);
  letter-spacing: 0.005em;
  margin: 0;
`;

const SectionRule = styled.span`
  flex: 1;
  height: 1px;
  background: var(--rule);
`;

// ── Component ──────────────────────────────────────────────────────────────

function CtrlSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Section>
      <SectionHead>
        <SectionTitle>{title}</SectionTitle>
        <SectionRule />
      </SectionHead>
      {children}
    </Section>
  );
}

export function MobileControlsView() {
  return (
    <ScrollWrap>
      <CtrlSection title="Display">
        <DisplayCell />
      </CtrlSection>

      <CtrlSection title="Render Mode">
        <RenderCell />
      </CtrlSection>

      <CtrlSection title="Study">
        <StudyCell />
      </CtrlSection>

      <CtrlSection title="Session">
        <SessionCell />
      </CtrlSection>
    </ScrollWrap>
  );
}
