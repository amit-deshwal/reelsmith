// RS-601/602: beat-grid editing (phase, tap tempo, half/double, downbeat) and music start/end policies.
export interface BeatGrid { beatTimesSec: number[]; beatsPerBar: number; downbeatIndex: number }

/** Move every beat by `deltaSec` (drag the phase). */
export function shiftPhase(g: BeatGrid, deltaSec: number): BeatGrid {
  const shifted = g.beatTimesSec.map((t) => t + deltaSec);
  const removed = shifted.findIndex((t) => t >= 0);
  if (removed < 0 || shifted.length - removed < 2) return g;
  return {
    ...g,
    beatTimesSec: shifted.slice(removed),
    downbeatIndex: ((g.downbeatIndex - removed) % g.beatsPerBar + g.beatsPerBar) % g.beatsPerBar,
  };
}

/** Median of intervals between taps -> bpm; needs at least 3 taps, ignores outliers beyond 40% of the median. */
export function tapTempo(tapTimesSec: number[]): number | null {
  if (tapTimesSec.length < 3) return null;
  const iv = tapTimesSec.slice(1).map((t, i) => t - tapTimesSec[i]!).filter((x) => x > 0.2 && x < 2);
  if (iv.length < 2) return null;
  const sorted = [...iv].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)]!;
  const good = iv.filter((x) => Math.abs(x - med) <= med * 0.4);
  return 60 / (good.reduce((s, x) => s + x, 0) / good.length);
}

/** Rebuild an even grid from a tempo, anchored on the first tap / given downbeat. */
export function gridFromTempo(bpm: number, anchorSec: number, durationSec: number, beatsPerBar = 4): BeatGrid {
  const step = 60 / bpm;
  const back = Math.floor(anchorSec / step);
  const first = anchorSec - back * step;
  const n = Math.floor((durationSec - first) / step) + 1;
  return { beatTimesSec: Array.from({ length: n }, (_, i) => first + i * step), beatsPerBar, downbeatIndex: back % beatsPerBar };
}

export function halveTempo(g: BeatGrid): BeatGrid {
  return { ...g, beatTimesSec: g.beatTimesSec.filter((_, i) => i % 2 === 0), downbeatIndex: Math.ceil(g.downbeatIndex / 2) % g.beatsPerBar };
}

export function doubleTempo(g: BeatGrid): BeatGrid {
  const out: number[] = [];
  g.beatTimesSec.forEach((t, i) => {
    out.push(t);
    const next = g.beatTimesSec[i + 1];
    if (next !== undefined) out.push((t + next) / 2);
  });
  return { ...g, beatTimesSec: out, downbeatIndex: (g.downbeatIndex * 2) % g.beatsPerBar };
}

/** Make the beat nearest `timeSec` the downbeat (index within a bar). */
export function setDownbeat(g: BeatGrid, timeSec: number): BeatGrid {
  let best = 0;
  g.beatTimesSec.forEach((t, i) => { if (Math.abs(t - timeSec) < Math.abs(g.beatTimesSec[best]! - timeSec)) best = i; });
  return { ...g, downbeatIndex: best % g.beatsPerBar };
}

/** Time of bar `n` (0 = first downbeat). */
export function barStartSec(g: BeatGrid, bar: number): number | undefined {
  return g.beatTimesSec[g.downbeatIndex + bar * g.beatsPerBar];
}

export type StartPolicy = 'fromStart' | 'firstDownbeat' | 'loudestSection' | 'userOffset';
export type EndPolicy = 'fadeOut' | 'endOnBar' | 'hardCut';

export function musicStart(policy: StartPolicy, g: BeatGrid, opts: { loudestSec?: number; offsetSec?: number } = {}): number {
  if (policy === 'fromStart') return 0;
  const down = g.beatTimesSec[g.downbeatIndex] ?? g.beatTimesSec[0] ?? 0;
  if (policy === 'firstDownbeat') return down;
  const target = policy === 'userOffset' ? Math.max(0, opts.offsetSec ?? 0) : opts.loudestSec ?? down;
  // snap to the nearest downbeat so the reel starts on a bar
  let best = down;
  for (let i = g.downbeatIndex; i < g.beatTimesSec.length; i += g.beatsPerBar) {
    if (Math.abs(g.beatTimesSec[i]! - target) < Math.abs(best - target)) best = g.beatTimesSec[i]!;
  }
  return best;
}

/** "Fit reel length to whole bars": the end time (seconds from music start) closest to `wantSec` that falls on a bar. */
export function fitToBars(g: BeatGrid, startSec: number, wantSec: number, round: 'nearest' | 'down' = 'nearest'): number {
  const bars: number[] = [];
  for (let i = g.downbeatIndex; i < g.beatTimesSec.length; i += g.beatsPerBar) {
    if (g.beatTimesSec[i]! > startSec + 1e-6) bars.push(g.beatTimesSec[i]! - startSec);
  }
  if (!bars.length) return wantSec;
  if (round === 'down') return [...bars].reverse().find((b) => b <= wantSec + 1e-6) ?? bars[0]!;
  return bars.reduce((best, b) => (Math.abs(b - wantSec) < Math.abs(best - wantSec) ? b : best), bars[0]!);
}
