// RS-109: cast shots by what they show (local shot tags), without AI. Used only when the recipe has `casting`
// rules, the clips carry tags and the agent did not choose the shots. Without tags the assemblers work as before.
import type { ShotTag } from '../shotTags';
import { SHOT_TAG_INFO } from '../shotTags';
import type { AssemblyClip } from './types';

export interface CastingRules {
  /** tags wanted for the opening shot, e.g. wide scenery */
  opener?: string[];
  /** tags wanted for the closing shot, e.g. a group of people */
  closer?: string[];
}

export interface CastPlan {
  /** slot index → clip chosen for it by content */
  designated: Map<number, AssemblyClip>;
  /** the other chosen clips, in the order they should fill the remaining slots */
  ranked: AssemblyClip[];
  /** plain-words summary for the user */
  note: string;
}

/** Tags below this probability are treated as unknown (no variety bonus, no repeat penalty). */
const SURE = 0.35;
/** A clip must fit the opener/closer tags at least this much to be cast there. */
const FIT = 0.25;

const sureTop = (c: AssemblyClip): ShotTag | undefined => (c.shot && c.shot.confidence >= SURE ? c.shot.top : undefined);
export const tagFit = (c: AssemblyClip, tags: readonly string[] = []): number =>
  tags.reduce((s, t) => s + (c.shot?.scores[t as ShotTag] ?? 0), 0);

function bestPerGroup(clips: AssemblyClip[]): AssemblyClip[] {
  const out: AssemblyClip[] = [];
  const groups = new Set<string>();
  for (const c of [...clips].sort((a, b) => b.score - a.score || a.assetId.localeCompare(b.assetId))) {
    if (c.groupId) { if (groups.has(c.groupId)) continue; groups.add(c.groupId); }
    out.push(c);
  }
  return out;
}

/** Highest score, with a bonus for a shot type not used yet and a penalty per repeat. */
function pickVaried(pool: AssemblyClip[], count: number, already: AssemblyClip[]): AssemblyClip[] {
  const left = [...pool];
  const chosen: AssemblyClip[] = [];
  const used = new Map<ShotTag, number>();
  for (const c of already) { const t = sureTop(c); if (t) used.set(t, (used.get(t) ?? 0) + 1); }
  while (chosen.length < count && left.length) {
    const value = (c: AssemblyClip) => {
      const t = sureTop(c);
      const n = t ? used.get(t) ?? 0 : 0;
      return c.score + (t && n === 0 ? 0.15 : 0) - 0.08 * n;
    };
    left.sort((a, b) => value(b) - value(a) || a.assetId.localeCompare(b.assetId));
    const c = left.shift()!;
    chosen.push(c);
    const t = sureTop(c);
    if (t) used.set(t, (used.get(t) ?? 0) + 1);
  }
  return chosen;
}

/** Reorder so neighbours differ in shot type where possible (greedy, keeps the given order otherwise). */
export function varyOrder(order: AssemblyClip[], before?: AssemblyClip): AssemblyClip[] {
  const left = [...order];
  const out: AssemblyClip[] = [];
  let prev = before;
  while (left.length) {
    const p = prev && sureTop(prev);
    const i = Math.max(0, left.findIndex((c) => !p || sureTop(c) !== p));
    prev = left.splice(i, 1)[0]!;
    out.push(prev);
  }
  return out;
}

const describe = (c: AssemblyClip) => `"${c.name}"${c.shot ? ` (${SHOT_TAG_INFO[c.shot.top].label})` : ''}`;

/**
 * Plan which clips fill `slotCount` slots. `openerSlot`/`closerSlot` get the clip that best fits the rules;
 * chronological recipes only use the tags to vary the selection (their order stays by capture time).
 * Returns null when no clip has tags, so callers fall back to the score-only pick.
 */
export function castSlots(
  clips: AssemblyClip[], slotCount: number, rules: CastingRules,
  o: { openerSlot: number; closerSlot: number; chronological: boolean; /** slots are fixed (clips may repeat), so the closer stays put */ fixedSlots?: boolean },
): CastPlan | null {
  if (slotCount <= 0 || !clips.some((c) => c.shot)) return null;
  const pool = bestPerGroup(clips);
  const n = Math.min(slotCount, pool.length);
  const designated = new Map<number, AssemblyClip>();
  const notes: string[] = [];
  const take = (slot: number, tags: string[] | undefined, what: string) => {
    if (o.chronological || !tags?.length || designated.has(slot) || designated.size >= n) return;
    const free = pool.filter((c) => ![...designated.values()].includes(c) && tagFit(c, tags) >= FIT);
    const best = free.sort((a, b) => (tagFit(b, tags) + 0.2 * b.score) - (tagFit(a, tags) + 0.2 * a.score) || a.assetId.localeCompare(b.assetId))[0];
    if (best) { designated.set(slot, best); notes.push(`${what} on ${describe(best)}`); }
  };
  // short footage: the reel ends at the last filled slot, so the closer moves up to it
  const closerSlot = o.fixedSlots ? o.closerSlot : Math.min(o.closerSlot, n - 1);
  take(o.openerSlot, rules.opener, 'opens');
  if (closerSlot !== o.openerSlot) take(closerSlot, rules.closer, 'closes');
  const rest = pool.filter((c) => ![...designated.values()].includes(c));
  let ranked = pickVaried(rest, n - designated.size, [...designated.values()]);
  if (o.chronological) {
    ranked.sort((a, b) => (a.captureTimeMs ?? Infinity) - (b.captureTimeMs ?? Infinity) || a.name.localeCompare(b.name) || a.assetId.localeCompare(b.assetId));
  } else {
    ranked = varyOrder(ranked, designated.get(o.openerSlot));
  }
  const kinds = new Set([...designated.values(), ...ranked].map(sureTop).filter(Boolean));
  notes.push(`${kinds.size} kind${kinds.size === 1 ? '' : 's'} of shot`);
  return { designated, ranked, note: `Shots chosen by what they show: ${notes.join(', ')}.` };
}

/** Flatten a plan into unique clips in slot order (fewer than the slots when footage is short; a designated slot past the end moves to the end). */
export function planToOrder(plan: CastPlan): AssemblyClip[] {
  const out = [...plan.ranked];
  for (const [slot, clip] of [...plan.designated].sort((a, b) => a[0] - b[0])) out.splice(Math.min(slot, out.length), 0, clip);
  return out;
}
