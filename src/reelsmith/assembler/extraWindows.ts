// More cuts than clips: a long video holds several different moments, so each one can be its own shot.
// Extra moments are virtual clips (assetId "<asset>#<n>", baseAssetId = the real asset) with their own window and score;
// the assembler places them like any clip and writes the real asset id on the timeline.
import type { AssemblyClip } from './types';

/** A video gives at most this many extra moments, so no single video dominates the reel. */
export const MAX_EXTRA_PER_CLIP = 3;

export const realAssetId = (clip: Pick<AssemblyClip, 'assetId' | 'baseAssetId'>): string => clip.baseAssetId ?? clip.assetId;

/**
 * Extra moments from the clips' own scored windows, best first: windows long enough for a whole shot of `shotFrames`,
 * at least a shot away from the clip's main moment and from each other. Returns up to `need` plus half again, so the
 * picker still has a choice.
 */
export function withExtraWindows(clips: readonly AssemblyClip[], need: number, shotFrames: number): AssemblyClip[] {
  if (need <= 0) return [];
  const found: AssemblyClip[] = [];
  for (const clip of clips) {
    const analysis = clip.sourceAnalysis;
    if (clip.kind !== 'video' || !analysis) continue;
    const mainStart = clip.bestStartFrame ?? 0;
    const taken: Array<[number, number]> = [[mainStart, mainStart + shotFrames]];
    const windows = [...analysis.windows].sort((a, b) => b.score - a.score || a.startFrame - b.startFrame);
    let n = 0;
    for (const w of windows) {
      if (n >= MAX_EXTRA_PER_CLIP) break;
      if (w.endFrame - w.startFrame < Math.max(shotFrames, analysis.minShotFrames)) continue;
      if (taken.some(([a, b]) => w.startFrame < b + shotFrames && w.startFrame + shotFrames > a - shotFrames)) continue;
      taken.push([w.startFrame, w.startFrame + shotFrames]);
      n += 1;
      found.push({
        ...clip,
        assetId: `${clip.assetId}#${n}`, baseAssetId: clip.assetId,
        score: w.score, bestStartFrame: w.startFrame,
        groupId: clip.groupId ? `${clip.groupId}#${n}` : undefined,
        sourceAnalysis: { ...analysis, windows: [w] },
      });
    }
  }
  found.sort((a, b) => b.score - a.score || a.assetId.localeCompare(b.assetId));
  return found.slice(0, need + Math.ceil(need / 2));
}

/**
 * Reorder so two moments of the same video are not neighbours, moving as little as possible. The first `keep` shots stay
 * where they are (the user's chosen opener). A shot with no clean swap is left where it was.
 */
export function spreadSameSource(order: readonly AssemblyClip[], keep = 0): AssemblyClip[] {
  const out = [...order];
  const base = (k: number) => (out[k] ? realAssetId(out[k]!) : undefined);
  const clashes = (k: number) => base(k) !== undefined && (base(k) === base(k - 1) || base(k) === base(k + 1));
  for (let i = Math.max(1, keep); i < out.length; i += 1) {
    if (!clashes(i)) continue;
    for (let j = i + 1; j < out.length; j += 1) {
      [out[i], out[j]] = [out[j]!, out[i]!];
      if (!clashes(i) && !clashes(j)) break;
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
  }
  return out;
}

/**
 * A photo does not move, so on a longer (joined) shot it looks frozen: swap it with a video that sits on a one-beat shot,
 * unless that would put two moments of the same video side by side. Shot 0 (the opener) stays.
 */
export function videosOnLongShots(order: readonly AssemblyClip[], lengthBeats: readonly number[]): AssemblyClip[] {
  const out = [...order];
  const base = (k: number) => (out[k] ? realAssetId(out[k]!) : undefined);
  const clash = (k: number) => base(k) !== undefined && (base(k) === base(k - 1) || base(k) === base(k + 1));
  for (let i = 1; i < out.length; i += 1) {
    if ((lengthBeats[i] ?? 1) <= 1 || out[i]!.kind !== 'image') continue;
    for (let j = 1; j < out.length; j += 1) {
      if (j === i || (lengthBeats[j] ?? 1) > 1 || out[j]!.kind !== 'video') continue;
      [out[i], out[j]] = [out[j]!, out[i]!];
      if (!clash(i) && !clash(j)) break;
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
  }
  return out;
}
