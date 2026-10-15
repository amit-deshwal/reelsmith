// RS-601: beat and bar marks on the music clip, drawn from the grid stored on the clip (props.rsBeats).
// Positions follow the clip's trim and speed. Bars are taller; beats are hidden when zoomed out too far.
import type { TimelineItem } from '../../editor/types';
import { readBeatGrid } from '../beatSnap';

export function BeatTicks({ item, px, fps, clipStartFrame, durationInFrames, srcInFrame, playbackRate, visibleStart, visibleEnd }: {
  item: TimelineItem; px: number; fps: number; clipStartFrame: number; durationInFrames: number;
  srcInFrame: number; playbackRate: number; visibleStart: number; visibleEnd: number;
}) {
  const grid = readBeatGrid(item);
  if (!grid) return null;
  const rate = Math.max(0.01, playbackRate);
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
  if (ticks.length === 0 || ticks.length > 4000) return null;
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      {ticks.map((t, i) => (
        <div key={i} style={{
          position: 'absolute', left: t.x, bottom: 0, width: t.bar ? 1.5 : 1, height: t.bar ? '70%' : '35%',
          background: t.bar ? 'rgba(186, 120, 255, 0.95)' : 'rgba(80, 220, 255, 0.75)',
        }} />
      ))}
    </div>
  );
}
