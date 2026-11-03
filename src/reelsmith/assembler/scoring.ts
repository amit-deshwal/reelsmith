// RS-105: clip scoring, near-duplicate grouping and best-window selection.
// Pure functions over precomputed features. Feature extraction (ffmpeg / scene detection) feeds these.
import type { AssemblyClip } from './types';
import { focusRetention, type FocusRect } from '../cropFocus';

/** Per-window measurements, each normalised to 0..1 by the extractor. */
export interface WindowFeatures {
  startFrame: number;
  endFrame: number;
  sharpness: number;
  /** 1 = well exposed, 0 = crushed or blown out */
  exposure: number;
  /** 0 = static, 1 = lots of motion */
  motion: number;
  /** size of the largest face/salient region, 0..1 of frame area */
  subject: number;
  speech: boolean;
  /**
   * RS-1258: how loud the clip's own sound gets in this window: dBFS of its 300-3400 Hz band (voices, laughter, a shout),
   * the 90th percentile of 20 ms steps. Phone clips read -9 (a shout at the mic) to -35 (distant talk); absent when silent.
   */
  level?: number;
  /** Locally detected face area, distinct from the model-free saliency proxy. */
  face?: number;
  /** Detected face, or subject when no face is available, in source-frame coordinates. */
  focusRect?: FocusRect;
}

export interface ClipFeatures {
  assetId: string;
  /** 64-bit difference hash as 16 hex chars, of a representative frame */
  dHash: string;
  captureTimeMs?: number;
  /** mean display colour of the clip (0..1), for matching shots to each other */
  color?: { r: number; g: number; b: number };
  /** shot boundaries split the clip; windows never cross them */
  windows: WindowFeatures[];
  /** source frames where a new shot starts (hard cuts inside the clip) */
  shotBoundariesFrame?: number[];
}

export interface ScoreWeights { sharpness: number; exposure: number; motion: number; subject: number; speech: number }
export const DEFAULT_WEIGHTS: ScoreWeights = { sharpness: 0.3, exposure: 0.25, motion: 0.15, subject: 0.2, speech: 0.1 };

export function scoreWindow(w: WindowFeatures, weights: ScoreWeights = DEFAULT_WEIGHTS, shape?: { width: number; height: number; targetAspect: number }): number {
  const total = weights.sharpness + weights.exposure + weights.motion + weights.subject + weights.speech;
  const retention = shape ? focusRetention(shape.width, shape.height, shape.targetAspect, w.focusRect) : 1;
  const sum = w.sharpness * weights.sharpness + w.exposure * weights.exposure + w.motion * weights.motion
    + Math.min(1, Math.max(w.subject, w.face ?? 0) * 3) * weights.subject * (0.5 + 0.5 * retention) + (w.speech ? weights.speech : 0);
  return Math.max(0, Math.min(1, sum / total));
}

/** Highest-scoring window whose length is at least `minFrames` (falls back to the longest). */
export function bestWindow(features: ClipFeatures, minFrames: number, weights?: ScoreWeights, shape?: { width: number; height: number; targetAspect: number }): WindowFeatures | undefined {
  const fits = features.windows.filter((w) => w.endFrame - w.startFrame >= minFrames);
  const pool = fits.length ? fits : [...features.windows].sort((a, b) => (b.endFrame - b.startFrame) - (a.endFrame - a.startFrame)).slice(0, 1);
  return pool.reduce<WindowFeatures | undefined>((best, w) =>
    (!best || scoreWindow(w, weights, shape) > scoreWindow(best, weights, shape) ? w : best), undefined);
}

function popcount16hex(hex: string): number {
  let n = 0;
  for (const ch of hex) { let v = parseInt(ch, 16); while (v) { n += v & 1; v >>= 1; } }
  return n;
}

export function hammingDistance(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/i.test(a) || !/^[0-9a-f]{16}$/i.test(b)) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d += popcount16hex((parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)).toString(16));
  return d;
}

/** Union-find grouping: clips within `maxDistance` bits (and `maxGapMs` of capture time, when known) share a group. */
export function groupNearDuplicates(
  items: ReadonlyArray<ClipFeatures>, maxDistance = 6, maxGapMs = 10 * 60_000,
): Map<string, string> {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]!; const b = items[j]!;
      const gap = a.captureTimeMs !== undefined && b.captureTimeMs !== undefined ? Math.abs(a.captureTimeMs - b.captureTimeMs) : 0;
      if (gap <= maxGapMs && hammingDistance(a.dHash, b.dHash) <= maxDistance) parent[find(j)] = find(i);
    }
  }
  const sizes = new Map<number, number>();
  items.forEach((_, i) => sizes.set(find(i), (sizes.get(find(i)) ?? 0) + 1));
  const out = new Map<string, string>();
  items.forEach((it, i) => {
    const root = find(i);
    if (sizes.get(root)! > 1) out.set(it.assetId, `g-${items[root]!.assetId}`);
  });
  return out;
}

/** Turn features into AssemblyClips ready for the picker. */
export function toAssemblyClips(
  base: ReadonlyArray<Omit<AssemblyClip, 'score' | 'groupId' | 'bestStartFrame' | 'captureTimeMs'>>,
  features: ReadonlyArray<ClipFeatures>,
  minShotFrames: number,
  weights?: ScoreWeights,
  targetAspect?: number,
): AssemblyClip[] {
  const byId = new Map(features.map((f) => [f.assetId, f]));
  const groups = groupNearDuplicates(features);
  return base.flatMap((c) => {
    const f = byId.get(c.assetId);
    if (!f) return { ...c, score: 0 };
    const cuts = [0, ...(f.shotBoundariesFrame ?? []), c.durationInFrames].sort((a, b) => a - b);
    if (c.kind === 'video' && !cuts.some((end, i) => i > 0 && end - cuts[i - 1]! >= minShotFrames)) return [];
    const shape = c.width && c.height && targetAspect ? { width: c.width, height: c.height, targetAspect } : undefined;
    const win = bestWindow(f, minShotFrames, weights, shape);
    return {
      ...c,
      score: win ? scoreWindow(win, weights, shape) : 0,
      ...(win ? { sharpness: win.sharpness } : {}),
      groupId: groups.get(c.assetId),
      captureTimeMs: f.captureTimeMs,
      bestStartFrame: win?.startFrame,
      sourceAnalysis: {
        minShotFrames,
        windows: f.windows.map((w) => ({ startFrame: Math.max(0, w.startFrame), endFrame: Math.min(c.durationInFrames, w.endFrame), score: scoreWindow(w, weights, shape), focusRect: w.focusRect, ...(w.speech ? { speech: true } : {}), ...(w.level !== undefined ? { level: w.level } : {}) }))
          .filter((w) => w.endFrame > w.startFrame).sort((a, b) => a.startFrame - b.startFrame),
        shotBoundariesFrame: [...(f.shotBoundariesFrame ?? [])],
      },
    };
  });
}
