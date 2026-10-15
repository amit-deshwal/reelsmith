// RS-105: clip scoring, near-duplicate grouping and best-window selection.
// Pure functions over precomputed features. Feature extraction (ffmpeg / scene detection) feeds these.
import type { AssemblyClip } from './types';

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
}

export interface ClipFeatures {
  assetId: string;
  /** 64-bit difference hash as 16 hex chars, of a representative frame */
  dHash: string;
  captureTimeMs?: number;
  /** shot boundaries split the clip; windows never cross them */
  windows: WindowFeatures[];
  /** source frames where a new shot starts (hard cuts inside the clip) */
  shotBoundariesFrame?: number[];
}

export interface ScoreWeights { sharpness: number; exposure: number; motion: number; subject: number; speech: number }
export const DEFAULT_WEIGHTS: ScoreWeights = { sharpness: 0.3, exposure: 0.25, motion: 0.15, subject: 0.2, speech: 0.1 };

export function scoreWindow(w: WindowFeatures, weights: ScoreWeights = DEFAULT_WEIGHTS): number {
  const total = weights.sharpness + weights.exposure + weights.motion + weights.subject + weights.speech;
  const sum = w.sharpness * weights.sharpness + w.exposure * weights.exposure + w.motion * weights.motion
    + Math.min(1, w.subject * 3) * weights.subject + (w.speech ? weights.speech : 0);
  return Math.max(0, Math.min(1, sum / total));
}

/** Highest-scoring window whose length is at least `minFrames` (falls back to the longest). */
export function bestWindow(features: ClipFeatures, minFrames: number, weights?: ScoreWeights): WindowFeatures | undefined {
  const fits = features.windows.filter((w) => w.endFrame - w.startFrame >= minFrames);
  const pool = fits.length ? fits : [...features.windows].sort((a, b) => (b.endFrame - b.startFrame) - (a.endFrame - a.startFrame)).slice(0, 1);
  return pool.reduce<WindowFeatures | undefined>((best, w) =>
    (!best || scoreWindow(w, weights) > scoreWindow(best, weights) ? w : best), undefined);
}

function popcount16hex(hex: string): number {
  let n = 0;
  for (const ch of hex) { let v = parseInt(ch, 16); while (v) { n += v & 1; v >>= 1; } }
  return n;
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
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
): AssemblyClip[] {
  const byId = new Map(features.map((f) => [f.assetId, f]));
  const groups = groupNearDuplicates(features);
  return base.map((c) => {
    const f = byId.get(c.assetId);
    if (!f) return { ...c, score: 0 };
    const win = bestWindow(f, minShotFrames, weights);
    return {
      ...c,
      score: win ? scoreWindow(win, weights) : 0,
      groupId: groups.get(c.assetId),
      captureTimeMs: f.captureTimeMs,
      bestStartFrame: win?.startFrame,
    };
  });
}
