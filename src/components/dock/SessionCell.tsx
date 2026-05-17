import { useVolumeStore } from '@/store/volumeStore';

const btnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '9px 14px',
  border: '1px solid var(--rule-2)',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--ink)',
  fontFamily: 'var(--sans)',
  fontSize: 12.5,
  cursor: 'pointer',
  transition: '120ms',
};

const kbdBase: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  color: 'var(--ink-4)',
  border: '1px solid var(--rule-2)',
  padding: '1px 5px',
  borderRadius: 3,
  letterSpacing: '0.05em',
};

export function SessionCell() {
  const setView = useVolumeStore((s) => s.setView);
  const volume = useVolumeStore((s) => s.volume);

  return (
    <>
      <button type="button" onClick={() => setView('import')} style={btnBase} disabled={!volume}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to import
        </span>
        <span style={kbdBase}>Esc</span>
      </button>
      <div
        style={{
          marginTop: 10,
          fontFamily: 'var(--sans)',
          fontSize: 10.5,
          color: 'var(--ink-3)',
          lineHeight: 1.4,
          paddingTop: 8,
          borderTop: '1px dashed var(--rule)',
        }}
      >
        <b style={{ color: 'var(--ink-2)' }}>Reference only.</b> Not for diagnosis, treatment
        planning, measurements, or implant workflows.
      </div>
    </>
  );
}
