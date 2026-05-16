import { useRef } from 'react';
import { useThreePreview } from '@/hooks/useThreePreview';
import { useVolumeStore } from '@/store/volumeStore';
import { RegistrationMarks } from '@/components/stage/RegistrationMarks';
import { ToolbarPill } from '@/components/stage/ToolbarPill';
import { TickScale } from '@/components/stage/TickScale';

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useThreePreview(canvasRef);
  const focus = useVolumeStore((s) => s.toolbar.focus);
  const hasVolume = useVolumeStore((s) => s.prepared3D !== null);

  return (
    <section
      style={
        focus
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 40,
              background:
                'radial-gradient(ellipse at 50% 55%, rgba(28,26,20,0.7) 0%, rgba(8,7,5,0.97) 80%)',
              overflow: 'hidden',
            }
          : {
              gridArea: 'stage',
              position: 'relative',
              background:
                'radial-gradient(ellipse at 50% 55%, rgba(28,26,20,0.7) 0%, rgba(8,7,5,0.97) 80%)',
              overflow: 'hidden',
              borderRight: '1px solid var(--rule)',
            }
      }
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      {!hasVolume && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-4)',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}
        >
          No volume loaded
        </div>
      )}
      <RegistrationMarks />
      <div
        style={{
          position: 'absolute',
          top: 22,
          left: 30,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 16,
          maxWidth: 'calc(100% - 420px)',
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 22,
            lineHeight: 1,
            fontWeight: 400,
            letterSpacing: '-0.005em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Main volume
        </div>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--ink-3)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            paddingBottom: 4,
          }}
        >
          Ray-cast · native res
        </div>
      </div>
      <ToolbarPill />
      <TickScale />
    </section>
  );
}
