import { useVolumeStore } from '@/store/volumeStore';
import { Header } from '@/components/header/Header';
import { Stage } from '@/components/stage/Stage';
import { Rail } from '@/components/rail/Rail';
import { Dock } from '@/components/dock/Dock';

export function AppGrid() {
  const railOpen = useVolumeStore((s) => s.toolbar.rail);

  return (
    <div
      className="console"
      style={{
        position: 'relative',
        zIndex: 1,
        display: 'grid',
        gridTemplateColumns: railOpen ? '1fr 360px' : '1fr 0px',
        gridTemplateRows: '56px 1fr 168px',
        gridTemplateAreas: '"header header" "stage rail" "dock dock"',
        height: '100vh',
        width: '100vw',
        gap: 0,
      }}
    >
      <Header />
      <Stage />
      <Rail />
      <Dock />
    </div>
  );
}
