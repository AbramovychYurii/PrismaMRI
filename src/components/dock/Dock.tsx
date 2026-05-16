import type { ReactNode } from 'react';
import { DisplayCell } from '@/components/dock/DisplayCell';
import { StudyCell } from '@/components/dock/StudyCell';
import { NavigationCell } from '@/components/dock/NavigationCell';
import { SessionCell } from '@/components/dock/SessionCell';

function CellHead({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span
        style={{
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 15,
          color: 'var(--ink)',
          letterSpacing: '0.005em',
        }}
      >
        {title}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
    </div>
  );
}

function DockCell({
  title,
  children,
  last,
}: {
  title: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: '16px 22px',
        borderRight: last ? 'none' : '1px solid var(--rule)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <CellHead title={title} />
      {children}
    </div>
  );
}

export function Dock() {
  return (
    <section
      style={{
        gridArea: 'dock',
        background: 'var(--panel)',
        borderTop: '1px solid var(--rule)',
        display: 'grid',
        gridTemplateColumns: '1.1fr 1.4fr 1fr 0.9fr',
        alignItems: 'stretch',
      }}
    >
      <DockCell title="Display">
        <DisplayCell />
      </DockCell>
      <DockCell title="Study">
        <StudyCell />
      </DockCell>
      <DockCell title="Navigation">
        <NavigationCell />
      </DockCell>
      <DockCell title="Session" last>
        <SessionCell />
      </DockCell>
    </section>
  );
}
