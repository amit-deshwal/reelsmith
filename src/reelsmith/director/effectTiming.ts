// RS-1203: a director section effect's timing (steady, fade, beat, drop, build) turned into the envelope of one clip in
// that section, on the song's beat clock. Times in the envelope are seconds from that clip's own start.
import type { PlanEffect } from '../../../shared/reelsmith/directorPlan';
import type { EffectMix } from '../effectMix';

export interface SectionClock {
  fps: number;
  /** section start and end, timeline frames */
  start: number;
  end: number;
  /** section length in beats */
  beats: number;
  /** timeline frame of beat b counted from the section start (not clamped) */
  beatAt: (b: number) => number;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

export function effectMixFor(e: PlanEffect, clock: SectionClock, itemStart: number, itemFrames: number): EffectMix | undefined {
  const { fps } = clock;
  const timing = e.timing ?? 'steady';
  const region = e.region && e.region !== 'all' ? { region: e.region } : {};
  const amount = e.strength !== undefined && e.strength < 1 ? { amount: e.strength } : {};
  if (timing === 'steady') return amount.amount !== undefined || region.region ? { ...amount, ...region } : undefined;
  const dur = itemFrames / fps;
  const rel = (f: number) => round((f - itemStart) / fps);
  const span: [number, number] = [Math.max(0, rel(clock.start)), Math.min(dur, rel(clock.end))];
  const beatLen = Math.max(0.1, (clock.beatAt(1) - clock.beatAt(0)) / fps);
  switch (timing) {
    case 'fade': { const f = round(Math.min(0.4, beatLen)); return { ...amount, ...region, span, fadeIn: f, fadeOut: f }; }
    case 'build': return { ...amount, ...region, span, ramp: 'up' };
    case 'drop': return { ...amount, ...region, hits: [rel(clock.start)], decay: round(beatLen), floor: 0 };
    case 'beat': {
      const every = e.every ?? 1;
      const hits: number[] = [];
      for (let b = 0; b < clock.beats - 1e-6; b += every) {
        const t = rel(clock.beatAt(b));
        if (t <= dur + 1e-6) hits.push(t);
      }
      // keep the last punch before the clip starts (it is still falling away) and every one inside it
      const firstInside = hits.findIndex((t) => t >= 0);
      const kept = firstInside < 0 ? hits.slice(-1) : hits.slice(hits[firstInside]! < 1e-3 ? firstInside : Math.max(0, firstInside - 1));
      return { ...amount, ...region, hits: kept, decay: round(0.35 * beatLen * Math.min(every, 2)), floor: 0.12 };
    }
  }
}
