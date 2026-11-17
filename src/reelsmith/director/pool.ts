// RS-1270: the director's clip list holds at most 60 clips (the shot log and the sheets must fit one tool result). It
// used to be the first 60 imported, in silence: on a 104-clip trip the pool clips were past #60 and the director said
// "nothing in the footage shows this". Now every clip is measured first and the list is chosen: clips under a second
// and near-duplicate takes leave, then every stretch of the shoot keeps its best clips, and the result says what left.
import { groupNearDuplicates, scoreWindow, type ClipFeatures } from '../assembler/scoring';

/** Clips in the director's numbered list. */
export const POOL_MAX = 60;
/** Clips stage 1 measures to choose the list from; more than this are left out by position, and the result says so. */
export const CANDIDATE_MAX = 200;
/** Stretches of the shoot (in import order) that each keep their best clips, so no part of the trip disappears. */
const STRETCHES = 10;

export interface PoolClip { id: string; kind: 'video' | 'image'; seconds: number; features?: ClipFeatures | null }
export type LeftWhy = 'short' | 'duplicate' | 'weaker';
export interface Pool { keep: string[]; left: Array<{ id: string; why: LeftWhy }> }

/** How good a clip's best two seconds are, 0..1; an unread video sits below any read one, a photo in the middle. */
export function clipScore(c: PoolClip): number {
  if (c.kind === 'image') return 0.45;
  const ws = c.features?.windows ?? [];
  return ws.length ? Math.max(...ws.map((w) => scoreWindow(w))) : 0.2;
}

export function pickPool(clips: readonly PoolClip[], max = POOL_MAX): Pool {
  if (clips.length <= max) return { keep: clips.map((c) => c.id), left: [] };
  const left: Pool['left'] = [];
  const score = new Map(clips.map((c) => [c.id, clipScore(c)]));
  let rest = clips.filter((c) => { if (c.kind === 'video' && c.seconds < 1) { left.push({ id: c.id, why: 'short' }); return false; } return true; });
  // of several takes of one thing, the best stays
  const groups = groupNearDuplicates(rest.flatMap((c) => (c.features ? [c.features] : [])));
  const bestOf = new Map<string, string>();
  for (const c of rest) { const g = groups.get(c.id); if (g && (!bestOf.has(g) || score.get(c.id)! > score.get(bestOf.get(g)!)!)) bestOf.set(g, c.id); }
  rest = rest.filter((c) => { const g = groups.get(c.id); if (g && bestOf.get(g) !== c.id) { left.push({ id: c.id, why: 'duplicate' }); return false; } return true; });
  if (rest.length > max) {
    const seats = Math.floor(max / STRETCHES);
    const chosen = new Set<string>();
    const byScore = (a: PoolClip, b: PoolClip) => score.get(b.id)! - score.get(a.id)!;
    for (let s = 0; s < STRETCHES; s += 1) {
      const stretch = rest.slice(Math.floor((s * rest.length) / STRETCHES), Math.floor(((s + 1) * rest.length) / STRETCHES));
      for (const c of [...stretch].sort(byScore).slice(0, seats)) chosen.add(c.id);
    }
    for (const c of [...rest].sort(byScore)) { if (chosen.size >= max) break; chosen.add(c.id); }
    rest = rest.filter((c) => { if (chosen.has(c.id)) return true; left.push({ id: c.id, why: 'weaker' }); return false; });
  }
  return { keep: rest.map((c) => c.id), left };
}

/** "44 of 104 clips are not in the list: 6 under a second, 9 near-duplicate takes, 29 weaker than their neighbours (a.mov, b.mov, …)". */
export function leftOutText(left: Pool['left'], total: number, name: (id: string) => string): string | undefined {
  if (!left.length) return undefined;
  const n = (why: LeftWhy) => left.filter((l) => l.why === why).length;
  const parts = [n('short') ? `${n('short')} under a second` : '', n('duplicate') ? `${n('duplicate')} near-duplicate takes` : '', n('weaker') ? `${n('weaker')} weaker than the clips kept from the same part of the shoot` : ''].filter(Boolean);
  const names = left.slice(0, 12).map((l) => name(l.id)).join(', ');
  return `${left.length} of ${total} clips are not in the list (it holds ${POOL_MAX}): ${parts.join(', ')}. Left out: ${names}${left.length > 12 ? ', …' : ''}. If the story needs something none of the listed clips shows, tell the user it may be in a clip that was left out.`;
}
