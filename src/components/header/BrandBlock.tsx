export function BrandBlock() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 22px',
        borderRight: '1px solid var(--rule)',
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          border: '1px solid var(--amber)',
          color: 'var(--amber)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 2,
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            inset: 3,
            border: '1px solid currentColor',
            opacity: 0.5,
          }}
        />
        <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 2 2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      <div>
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 17,
            fontWeight: 500,
            letterSpacing: '0.02em',
          }}
        >
          Prisma
          <em style={{ fontStyle: 'italic', color: 'var(--ink-2)', fontWeight: 400 }}>MRI</em>
        </div>
      </div>
    </div>
  );
}
