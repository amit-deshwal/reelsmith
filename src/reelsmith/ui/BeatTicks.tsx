// RS-601: beat and bar marks on the music clip, drawn from the grid stored on the clip (props.rsBeats).
// Positions follow the clip's trim and speed. Bars are taller; beats are hidden when zoomed out too far.
import type { TimelineItem } from '../../editor/types';
import { useEffect, useRef, useState } from 'react';
import { readBeatGrid } from '../beatSnap';
import { shiftPhase, type BeatGrid } from '../beatGrid';

export function BeatTicks({ item, px, fps, clipStartFrame, durationInFrames, srcInFrame, playbackRate, visibleStart, visibleEnd, onPhaseChange }: {
  item: TimelineItem; px: number; fps: number; clipStartFrame: number; durationInFrames: number;
  srcInFrame: number; playbackRate: number; visibleStart: number; visibleEnd: number;
  onPhaseChange?: (grid: BeatGrid) => void;
}) {
  const baseGrid = readBeatGrid(item);
  const [previewDelta, setPreviewDelta] = useState<number | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; handleX: number; grid: BeatGrid } | null>(null);
  const dragging = previewDelta !== null;
  const rate = Math.max(0.01, playbackRate);
  const deltaForX = (clientX: number, current: { startX: number; grid: BeatGrid }) => Math.max(
    (clientX - current.startX) * rate / (fps * px),
    -(current.grid.beatTimesSec.at(-2) ?? 0) + 0.0001,
  );
  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const current = drag.current;
      if (current?.pointerId !== event.pointerId) return;
      event.stopPropagation();
      setPreviewDelta(deltaForX(event.clientX, current));
    };
    const onUp = (event: PointerEvent) => {
      const current = drag.current;
      if (current?.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const delta = deltaForX(event.clientX, current);
      drag.current = null;
      setPreviewDelta(null);
      if (Math.abs(delta) > 0.001) onPhaseChange?.(shiftPhase(current.grid, delta));
    };
    const cancel = () => {
      drag.current = null;
      setPreviewDelta(null);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('blur', cancel);
    };
  }, [dragging, onPhaseChange, px, fps, rate]);
  if (!baseGrid) return null;
  const grid = previewDelta === null ? baseGrid : shiftPhase(baseGrid, previewDelta);
  const spacingPx = grid.beatTimesSec.length > 1 ? ((grid.beatTimesSec[1]! - grid.beatTimesSec[0]!) * fps / rate) * px : 0;
  const showBeats = spacingPx >= 4;
  const ticks: Array<{ x: number; bar: boolean }> = [];
  grid.beatTimesSec.forEach((sec, i) => {
    const k = i - grid.downbeatIndex;
    const bar = ((k % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar === 0;
    if (!bar && !showBeats) return;
    const f = clipStartFrame + (sec * fps - srcInFrame) / rate;
    if (f < clipStartFrame || f > clipStartFrame + durationInFrames || f < visibleStart || f > visibleEnd) return;
    ticks.push({ x: (f - clipStartFrame) * px, bar });
  });
  if (ticks.length > 4000 || (ticks.length === 0 && !drag.current)) return null;
  const handle = drag.current && previewDelta !== null
    ? { x: drag.current.handleX + previewDelta * fps * px / rate }
    : ticks.find((tick) => tick.bar) ?? ticks[0];
  return (
    <>
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
        {ticks.map((t, i) => (
          <div key={i} style={{
            position: 'absolute', left: t.x, bottom: 0, width: t.bar ? 1.5 : 1, height: t.bar ? '70%' : '35%',
            background: t.bar ? 'rgba(186, 120, 255, 0.95)' : 'rgba(80, 220, 255, 0.75)',
          }} />
        ))}
      </div>
      {onPhaseChange && handle && (
        <button type="button" data-beat-phase-handle aria-label="Drag beat grid phase"
          title="Drag to align the beat grid with the music"
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button !== 0) return;
            event.preventDefault();
            drag.current = { pointerId: event.pointerId, startX: event.clientX, handleX: handle.x, grid: baseGrid };
            event.currentTarget.setPointerCapture(event.pointerId);
            setPreviewDelta(0);
          }}
          onClick={(event) => event.stopPropagation()}
          style={{ position: 'absolute', left: handle.x - 7, top: 0, width: 15, height: 13,
            padding: 0, border: '1px solid rgba(255,255,255,.8)', borderRadius: 3,
            background: '#ba78ff', boxShadow: '0 1px 3px rgba(0,0,0,.7)',
            cursor: 'ew-resize', touchAction: 'none', zIndex: 2 }} />
      )}
    </>
  );
}
