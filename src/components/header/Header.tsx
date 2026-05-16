import { BrandBlock } from '@/components/header/BrandBlock';
import { RunStrip } from '@/components/header/RunStrip';
import { useVolumeStore } from '@/store/volumeStore';
import { accentRgba } from '@/constants';

export function Header() {
  const loading = useVolumeStore((s) => s.loading);

  return (
    <header
      style={{
        gridArea: 'header',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--panel)',
        display: 'grid',
        gridTemplateColumns: '280px 1fr auto',
        alignItems: 'stretch',
        position: 'relative',
      }}
    >
      <BrandBlock />
      <RunStrip />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '0 22px',
          borderLeft: '1px solid var(--rule)',
        }}
      />
      {loading.active && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: 2,
            width: `${loading.percent}%`,
            background: 'var(--amber)',
            transition: 'width 180ms ease-out',
            boxShadow: `0 0 6px ${accentRgba('amber', 0.6)}`,
          }}
        />
      )}
    </header>
  );
}
