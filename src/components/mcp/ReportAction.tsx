import { AnnotationActionButton } from '@/components/annotations/AnnotationHud';
import { ReportModal } from '@/components/mcp/ReportModal';
import type { AnnotationActionContext } from '@/viewer';
import { FileText } from 'lucide-react';
import { useState } from 'react';

/** "Report" in the findings card: opens the PDF export for the finding shown. */
export function ReportAction({ finding, index, all }: AnnotationActionContext) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AnnotationActionButton aria-label="Generate report" onClick={() => setOpen(true)}>
        <FileText size={11} />
        Report
      </AnnotationActionButton>
      {open && (
        <ReportModal
          finding={finding}
          findingIndex={index}
          allFindings={all}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
