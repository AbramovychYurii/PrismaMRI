import type { SliceWindowLevel, VolumeHistogram } from '@/types';
import { useEffect, useRef } from 'react';
import styled from 'styled-components';

const Wrap = styled.div`
  position: relative;
  width: 100%;
  height: 22px;
  border-radius: 3px;
  overflow: hidden;
  background: #08070580;
`;

const Canvas = styled.canvas`
  display: block;
  width: 100%;
  height: 100%;
`;

interface Props {
  histogram: VolumeHistogram;
  wl: SliceWindowLevel;
}

export function HistogramBar({ histogram, wl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function draw() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const W = Math.floor(rect.width);
      const H = Math.floor(rect.height);
      if (W === 0 || H === 0) return;

      const dpr = devicePixelRatio || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      const { bins, min, max } = histogram;
      const { window: win, level } = wl;
      const span = max - min || 1;

      const loVal = level - win / 2;
      const hiVal = level + win / 2;

      const toX = (v: number) => ((v - min) / span) * W;
      const loX = Math.max(0, Math.min(W, toX(loVal)));
      const hiX = Math.max(0, Math.min(W, toX(hiVal)));

      let maxLog = 0;
      for (let i = 0; i < bins.length; i++) {
        const v = Math.log1p(bins[i]);
        if (v > maxLog) maxLog = v;
      }
      if (maxLog === 0) return;

      const barW = W / bins.length;
      for (let i = 0; i < bins.length; i++) {
        if (bins[i] === 0) continue;
        const barH = (Math.log1p(bins[i]) / maxLog) * (H - 2);
        const x = (i / bins.length) * W;
        const binMid = min + ((i + 0.5) / bins.length) * span;
        const inside = binMid >= loVal && binMid <= hiVal;
        ctx.fillStyle = inside ? 'rgba(215, 160, 55, 0.82)' : 'rgba(90, 80, 62, 0.55)';
        ctx.fillRect(x, H - barH, barW + 0.6, barH);
      }

      if (hiX > loX) {
        ctx.fillStyle = 'rgba(220, 160, 50, 0.06)';
        ctx.fillRect(loX, 0, hiX - loX, H);
      }

      ctx.strokeStyle = 'rgba(235, 178, 60, 0.88)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(loX, 0);
      ctx.lineTo(loX, H);
      ctx.moveTo(hiX, 0);
      ctx.lineTo(hiX, H);
      ctx.stroke();
    }

    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    draw();
    return () => ro.disconnect();
  }, [histogram, wl]);

  return (
    <Wrap>
      <Canvas ref={canvasRef} />
    </Wrap>
  );
}
