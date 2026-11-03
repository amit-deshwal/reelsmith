// Which moment of a clip to use: the best-scoring stretch inside one camera shot, away from stretches already used.
import type { AssemblyClip } from './types';

export type Range = [number, number];

/** Source start (frames) for `len` frames of `clip`, away from `used` ranges by `gap`, inside one camera shot. */
export function pickMoment(clip: AssemblyClip, len: number, used: Range[], gap: number): number | null {
  if (clip.kind === 'image') return 0;
  const end = Math.floor(clip.durationInFrames);
  const pad = 6;
  const a = clip.sourceAnalysis;
  const bounds = [0, ...(a?.shotBoundariesFrame ?? []).filter((f) => f > 0 && f < end), end].sort((x, y) => x - y);
  const score = (s: number): number => {
    if (a?.windows.length) {
      return a.windows.reduce((sum, w) => sum + Math.max(0, Math.min(s + len, w.endFrame) - Math.max(s, w.startFrame)) * w.score, 0) / len;
    }
    return 1 - Math.abs(s - (clip.bestStartFrame ?? 0)) / Math.max(1, end);
  };
  const clear = (s: number, g: number) => used.every(([u0, u1]) => s + len + g <= u0 || s >= u1 + g);
  for (const g of [gap, 0]) {
    let best: { s: number; v: number } | null = null;
    for (let i = 0; i < bounds.length - 1; i += 1) {
      const lo = bounds[i]! + (i > 0 ? pad : 0);
      const hi = bounds[i + 1]! - (i < bounds.length - 2 ? pad : 0) - len;
      for (let s = lo; s <= hi; s += 3) {
        if (!clear(s, g)) continue;
        const v = score(s);
        if (!best || v > best.v + 1e-9) best = { s, v };
      }
    }
    if (best) return best.s;
  }
  return null;
}
