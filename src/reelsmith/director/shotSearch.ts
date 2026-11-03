// RS-1256: find the shots that show what a line says. The visual model already turned every sampled frame of every clip
// into a vector (the same ones shot tags and media search use); a line of the story becomes a vector the same way, and
// the frames nearest to it are the moments to cast. Whether a frame really shows the phrase is judged on the model's own
// scale, measured on 20 phone clips (2026-11-03, Chinese-CLIP q4): phrases that are in the footage ("a person standing on
// a mountain summit with a view", "a group photo of friends") best-match at 0.46-0.50; phrases that are not (a waterfall,
// food, a car, a tent, a dog, a temple) best-match at 0.37-0.42. How much of the footage a frame beats does not tell them
// apart (the best frame always beats all the rest), so it is reported only as context.
import { normalizeVector } from '../../media/semantic-search/vectorSearch';

export interface FrameVector { assetId: string; sampleTime: number; vector: ArrayLike<number> }
export interface ShotHit {
  assetId: string;
  /** seconds into the clip */
  atSec: number;
  /** cosine similarity with the query */
  match: number;
  /** share of all sampled frames this one beats (1 = the best frame there is) */
  standout: number;
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) sum += Number(a[i] ?? 0) * Number(b[i] ?? 0);
  return sum;
};

/** At or above this a frame clearly shows the phrase; below MAYBE, nothing does. */
export const MATCH_SURE = 0.45;
export const MATCH_MAYBE = 0.42;
export type Shows = 'sure' | 'maybe' | 'weak';
export const showsOf = (match: number): Shows => (match >= MATCH_SURE ? 'sure' : match >= MATCH_MAYBE ? 'maybe' : 'weak');

export interface SearchOptions {
  limit: number;
  /** at most this many hits from one clip (default 1: the point is to find different shots) */
  perClip?: number;
  /** hits in one clip at least this far apart, seconds (default 2) */
  minGapSec?: number;
  /** only these clips count (the director's numbered list) */
  allowed?: ReadonlySet<string>;
}

/** The moments nearest to the query, best first. */
export function searchMoments(frames: readonly FrameVector[], query: ArrayLike<number>, o: SearchOptions): ShotHit[] {
  const q = normalizeVector(query);
  const pool = o.allowed ? frames.filter((f) => o.allowed!.has(f.assetId)) : frames;
  if (!pool.length || !q.some((x) => x !== 0)) return [];
  const scored = pool.map((f) => ({ f, score: dot(normalizeVector(f.vector), q) }));
  const sorted = scored.map((s) => s.score).sort((a, b) => a - b);
  const beaten = (score: number) => {
    // first index with a value >= score
    let lo = 0; let hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid]! < score) lo = mid + 1; else hi = mid; }
    return sorted.length > 1 ? lo / (sorted.length - 1) : 1;
  };
  const perClip = o.perClip ?? 1;
  const gap = o.minGapSec ?? 2;
  const taken = new Map<string, number[]>();
  const hits: ShotHit[] = [];
  for (const { f, score } of scored.sort((a, b) => b.score - a.score || a.f.assetId.localeCompare(b.f.assetId) || a.f.sampleTime - b.f.sampleTime)) {
    const times = taken.get(f.assetId) ?? [];
    if (times.length >= perClip || times.some((t) => Math.abs(t - f.sampleTime) < gap)) continue;
    taken.set(f.assetId, [...times, f.sampleTime]);
    hits.push({ assetId: f.assetId, atSec: Math.round(f.sampleTime * 10) / 10, match: Math.round(score * 1000) / 1000, standout: Math.round(Math.min(1, beaten(score)) * 100) / 100 });
    if (hits.length >= o.limit) break;
  }
  return hits;
}

/** How well a shot already in the reel shows a line: the best standout among the frames within its stretch of the clip. */
export function lineFit(frames: readonly FrameVector[], query: ArrayLike<number>, shot: { assetId: string; fromSec: number; toSec: number }): number | null {
  const mine = frames.filter((f) => f.assetId === shot.assetId && f.sampleTime >= shot.fromSec - 0.75 && f.sampleTime <= shot.toSec + 0.75);
  if (!mine.length) return null;
  const q = normalizeVector(query);
  const all = frames.map((f) => dot(normalizeVector(f.vector), q)).sort((a, b) => a - b);
  const best = Math.max(...mine.map((f) => dot(normalizeVector(f.vector), q)));
  let lo = 0; let hi = all.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (all[mid]! < best) lo = mid + 1; else hi = mid; }
  return Math.round((all.length > 1 ? lo / (all.length - 1) : 1) * 100) / 100;
}
