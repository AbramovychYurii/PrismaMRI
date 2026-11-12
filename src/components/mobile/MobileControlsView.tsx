import { DisplayCell } from '@/components/dock/DisplayCell';
import { RenderCell } from '@/components/dock/RenderCell';
import { SessionCell } from '@/components/dock/SessionCell';
import { StudyCell } from '@/components/dock/StudyCell';
import { useViewerLabels } from '@/viewer';
import styles from './MobileControlsView.module.css';

function CtrlSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <span className={styles.sectionRule} />
      </div>
      {children}
    </section>
  );
}

export function MobileControlsView() {
  const { sections } = useViewerLabels();
  return (
    <div className={styles.scrollWrap}>
      <CtrlSection title={sections.display}>
        <DisplayCell />
      </CtrlSection>

      <CtrlSection title={sections.render}>
        <RenderCell />
      </CtrlSection>

      <CtrlSection title={sections.study}>
        <StudyCell />
      </CtrlSection>

      <CtrlSection title={sections.session}>
        <SessionCell />
      </CtrlSection>
    </div>
  );
}
