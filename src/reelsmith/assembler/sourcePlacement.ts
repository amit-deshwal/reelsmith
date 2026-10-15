import type { AssemblyClip } from './types';

export interface SourcePlacement { srcInFrame: number; playbackRate: number }

/** Fit the requested timeline length inside one source shot, choosing its best-scoring range. */
export function sourcePlacement(clip: AssemblyClip, duration: number): SourcePlacement {
  const length = Math.max(1, Math.floor(duration));
  const end = Math.max(1, Math.floor(clip.durationInFrames));
  const analysis = clip.sourceAnalysis;
  if (!analysis) {
    const start = Math.max(0, Math.min(clip.bestStartFrame ?? 0, end - 1));
    const available = end - start;
    if (available < length / 4) throw new Error(`${clip.name}: not enough source footage for this shot. Add more clips or choose shorter cuts.`);
    return { srcInFrame: start, playbackRate: Math.min(1, available / length) };
  }
  const boundaries = [0, ...analysis.shotBoundariesFrame.filter((f) => f > 0 && f < end), end]
    .sort((a, b) => a - b);
  const windows = analysis.windows.filter((w) => Number.isFinite(w.score) && w.endFrame > w.startFrame);
  const scoreRange = (start: number, stop: number) => windows.reduce((sum, w) =>
    sum + Math.max(0, Math.min(stop, w.endFrame) - Math.max(start, w.startFrame)) * w.score, 0) / (stop - start);
  const candidates: Array<SourcePlacement & { score: number }> = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const a = boundaries[i]!; const b = boundaries[i + 1]!;
    // Only use measured footage; a truncated analysis must not authorize an unseen tail.
    const covered = windows.filter((w) => w.startFrame >= a && w.endFrame <= b).sort((x, y) => x.startFrame - y.startFrame);
    if (!covered.length) continue;
    const start = Math.max(a, covered[0]!.startFrame);
    const stop = Math.min(b, covered[covered.length - 1]!.endFrame);
    const available = stop - start;
    if (available < Math.max(length / 4, analysis.minShotFrames)) continue;
    const used = Math.min(length, available);
    const rate = used / length;
    const starts = new Set([start, stop - used, ...covered.flatMap((w) => [w.startFrame, w.endFrame - used])]);
    for (const at of starts) {
      if (at < start || at + used > stop) continue;
      let coveredTo = at;
      for (const window of covered) {
        if (window.endFrame <= coveredTo) continue;
        if (window.startFrame > coveredTo) break;
        coveredTo = window.endFrame;
      }
      if (coveredTo < at + used) continue;
      candidates.push({ srcInFrame: at, playbackRate: rate, score: scoreRange(at, at + used) });
    }
  }
  // Prefer real-time footage. Within that pool, choose the highest score, then the earliest range.
  const realTime = candidates.filter((c) => c.playbackRate === 1);
  const best = (realTime.length ? realTime : candidates).sort((a, b) => b.score - a.score || a.srcInFrame - b.srcInFrame)[0];
  if (!best) throw new Error(`${clip.name}: no single shot is long enough. Add more clips or choose shorter cuts.`);
  return { srcInFrame: best.srcInFrame, playbackRate: best.playbackRate };
}
