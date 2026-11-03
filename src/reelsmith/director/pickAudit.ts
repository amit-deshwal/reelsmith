// RS-1255: does the reel show the best of the footage? The build review reads the plan and the song; this reads the
// picks against the clip analysis: a shot placed on a soft, dark or blown-out stretch while a sharper stretch of the
// same clip exists, and strong clips left out while weaker ones play. Pure, so the same footage always gives the same
// findings; the numbers come from the analysis every clip already has.
import type { ClipFeatures, WindowFeatures } from '../assembler/scoring';

/** One shot the build placed: which clip, where in it (source frame at the timeline rate) and for how long. */
export interface UsedShot { section: number; assetId: string; inFrame: number; frames: number }
export interface PickFinding { section?: number; issue: string; fix: string }

/** Below this a stretch reads as out of focus on a phone screen (the extractor's log-variance scale). */
export const SOFT = 0.3;
/** Below this the stretch is too dark or too blown out to carry a shot. */
export const BAD_EXPOSURE = 0.3;
/** An alternative must beat the used stretch by this much to be worth naming. */
const BETTER_BY = 0.15;

/** Sharpness and exposure of a window, the two things a viewer cannot forgive. */
const quality = (w: Pick<WindowFeatures, 'sharpness' | 'exposure'>) => 0.6 * w.sharpness + 0.4 * w.exposure;

/** Mean of the windows a shot overlaps, weighted by how much of the shot each one covers. */
export function stretchOf(features: ClipFeatures, inFrame: number, frames: number): { sharpness: number; exposure: number; motion: number } | null {
  let covered = 0; let sharpness = 0; let exposure = 0; let motion = 0;
  for (const w of features.windows) {
    const overlap = Math.min(inFrame + frames, w.endFrame) - Math.max(inFrame, w.startFrame);
    if (overlap <= 0) continue;
    covered += overlap; sharpness += w.sharpness * overlap; exposure += w.exposure * overlap; motion += w.motion * overlap;
  }
  return covered ? { sharpness: sharpness / covered, exposure: exposure / covered, motion: motion / covered } : null;
}

/** The best stretch of a clip that is `frames` long and sharp and well exposed, by start frame; null when none beats `than`. */
export function betterStretch(features: ClipFeatures, frames: number, than: number): { inFrame: number; quality: number } | null {
  let best: { inFrame: number; quality: number } | null = null;
  for (const w of features.windows) {
    if (w.endFrame - w.startFrame < Math.min(frames, 12)) continue;
    const q = quality(w);
    if (q >= than + BETTER_BY && (!best || q > best.quality)) best = { inFrame: Math.max(0, Math.min(w.startFrame, w.endFrame - frames)), quality: q };
  }
  return best;
}

export interface PickAuditInput {
  used: readonly UsedShot[];
  /** the analysis of every clip the reel could have used (clips without one are skipped) */
  features: ReadonlyMap<string, ClipFeatures>;
  /** how the agent names a clip, e.g. "#4" */
  label: (assetId: string) => string;
  fps: number;
  /** photos have one window and cannot be moved: only a different clip fixes them */
  isImage?: (assetId: string) => boolean;
}

const sec = (frames: number, fps: number) => Math.round((frames / fps) * 10) / 10;

export function auditPicks(r: PickAuditInput): PickFinding[] {
  const out: PickFinding[] = [];
  const seen = new Set<string>();
  for (const shot of r.used) {
    const features = r.features.get(shot.assetId);
    if (!features) continue;
    const stretch = stretchOf(features, shot.inFrame, shot.frames);
    if (!stretch) continue;
    const soft = stretch.sharpness < SOFT;
    const dark = stretch.exposure < BAD_EXPOSURE;
    if (!soft && !dark) continue;
    const key = `${shot.section}:${shot.assetId}:${Math.round(shot.inFrame / 15)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = r.label(shot.assetId);
    const where = r.isImage?.(shot.assetId) ? name : `${name}@${sec(shot.inFrame, r.fps)}`;
    const why = soft && dark ? 'soft and badly exposed' : soft ? 'out of focus' : stretch.exposure < 0.15 ? 'nearly black or blown out' : 'too dark or too bright';
    const alt = r.isImage?.(shot.assetId) ? null : betterStretch(features, shot.frames, quality(stretch));
    out.push({
      section: shot.section,
      issue: `section ${shot.section} shows ${where}, which is ${why} (sharpness ${stretch.sharpness.toFixed(2)}, exposure ${stretch.exposure.toFixed(2)})`,
      fix: alt ? `use ${name}@${sec(alt.inFrame, r.fps)} instead: the same clip, sharp and well lit there` : 'use another clip for this shot',
    });
  }
  return out.slice(0, 4);
}

/** The sharpest, best-lit clips the reel left out while it shows weaker stretches: the clip and its best moment. */
export function strongLeftOut(
  features: ReadonlyMap<string, ClipFeatures>, usedIds: ReadonlySet<string>, usedShots: readonly UsedShot[], fps: number,
): Array<{ assetId: string; score: number; atSec: number }> {
  const best = (f: ClipFeatures) => f.windows.reduce<{ score: number; start: number } | null>((b, w) => {
    const score = quality(w);
    return !b || score > b.score ? { score, start: w.startFrame } : b;
  }, null);
  // how good the reel's own shots are: the median of its used stretches
  const usedScores = usedShots.flatMap((s) => {
    const f = features.get(s.assetId);
    const stretch = f && stretchOf(f, s.inFrame, s.frames);
    return stretch ? [0.6 * stretch.sharpness + 0.4 * stretch.exposure] : [];
  }).sort((a, b) => a - b);
  const median = usedScores.length ? usedScores[Math.floor(usedScores.length / 2)]! : 0;
  const left: Array<{ assetId: string; score: number; atSec: number }> = [];
  for (const [assetId, f] of features) {
    if (usedIds.has(assetId)) continue;
    const b = best(f);
    if (!b || b.score < 0.72 || b.score < median + 0.1) continue;
    left.push({ assetId, score: Math.round(b.score * 100) / 100, atSec: sec(b.start, fps) });
  }
  return left.sort((a, b) => b.score - a.score || a.assetId.localeCompare(b.assetId)).slice(0, 3);
}

/** Everything the build review says about the picks: weak stretches, then the strong clips left out. */
export function pickFindings(r: PickAuditInput & { usedIds: ReadonlySet<string>; clipCount: number }): PickFinding[] {
  const out = auditPicks(r);
  const left = strongLeftOut(r.features, r.usedIds, r.used, r.fps);
  if (left.length && r.clipCount > r.usedIds.size) {
    out.push({
      issue: `the sharpest, best-lit clips left out: ${left.map((l) => `${r.label(l.assetId)}@${l.atSec} (${l.score})`).join(', ')}`,
      fix: 'if one fits a part of the story better than a weaker shot, swap it in; if the story does not need it, leave it out',
    });
  }
  return out;
}
