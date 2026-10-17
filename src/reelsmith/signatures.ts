// Signature styles: one considered, restrained treatment instead of a stack of effects. A signature is a look on every clip,
// at most one accent effect on the opening shot only (the hook), and one transition type on the cuts. Everything is an ordinary
// look effect or transition, so sliders stay editable and the next signature or look replaces what this one added.
import type { AtomicAction } from '../editor/reducerActions';
import type { GlslTransitionType } from '../editor/transitionTypes';
import type { TimelineItem, TimelineState } from '../editor/types';
import { lookById, planLook, type ReelLookStep } from './looks';

export interface ReelSignature {
  id: string; name: string; mood: string; description: string;
  /** recipe ids that suit it best, in order of preference (all of them work with it) */
  recipes: string[];
  look: string;
  /** one accent on the first shot only */
  hook?: ReelLookStep;
  /** one transition type on the cuts; absent = hard cuts */
  transition?: GlslTransitionType;
}

export const SIGNATURES: ReelSignature[] = [
  {
    id: 'cinematic-drift', name: 'Cinematic drift', mood: 'travel, landscapes, calm, premium, trek',
    description: 'Teal and orange grade with soft halation, an anamorphic flare on the opening shot and whip-blur cuts.',
    recipes: ['travel-diary', 'travel-beat-montage', 'mini-vlog'], look: 'cinematic-travel',
    hook: { assetId: 'builtin:fx-anamorphic-flare', overrides: { intensity: 0.5 } }, transition: 'whip-blur',
  },
  {
    id: 'neon-pulse', name: 'Neon pulse', mood: 'nightlife, parties, city, energetic, thrilling, unique',
    description: 'Cyber grade with bloom, a zoom-blur punch on the opening shot and chroma-glitch cuts.',
    recipes: ['beat-cut', 'gang-reel', 'travel-beat-montage'], look: 'neon-night',
    hook: { assetId: 'builtin:fx-zoom-blur', overrides: {} }, transition: 'chroma-glitch',
  },
  {
    id: 'golden-memory', name: 'Golden memory', mood: 'couples, sunsets, family, nostalgic, warm, friends trip',
    description: 'Warm sunset grade with mist and a light leak on every cut.',
    recipes: ['photo-dump', 'mini-vlog', 'travel-diary'], look: 'golden-hour', transition: 'light-leak',
  },
  {
    id: 'retro-tape', name: 'Retro tape', mood: 'throwback, 2000s, funny, friends, casual',
    description: 'VHS wobble and colour bleed with flash cuts, the whole reel looking like old camcorder footage.',
    recipes: ['gang-reel', 'beat-cut', 'photo-dump'], look: 'retro-vhs', transition: 'flash',
  },
  {
    id: 'clean-minimal', name: 'Clean minimal', mood: 'lifestyle, portraits, fashion, food, aesthetic, selfies',
    description: 'Soft pastel colour and nothing else: hard cuts, no effects, the footage does the work.',
    recipes: ['photo-dump', 'mini-vlog', 'collage-grid'], look: 'soft-pastel',
  },
];

export const signatureById = (id: string) => SIGNATURES.find((s) => s.id === id);

export interface SignaturePlan { actions: AtomicAction[]; clips: number; cuts: number; label: string }

/** Main-track picture clips in time order: the shots a transition can join. */
function shots(items: readonly TimelineItem[]): TimelineItem[] {
  return items.filter((i) => (i.kind === 'video' || i.kind === 'image') && i.track === 'V1').sort((a, b) => a.startFrame - b.startFrame);
}

/**
 * Look on every clip + hook accent on the first shot + one transition type on the cuts. Transitions are only added when the
 * timeline has none (a recipe such as Travel Diary already places its own) and only between neighbouring shots.
 */
export function planSignature(state: Pick<TimelineState, 'items' | 'transitions'>, sig: ReelSignature, withTransitions = true): SignaturePlan {
  const look = lookById(sig.look)!;
  const base = planLook(state.items, look);
  const first = shots(state.items)[0];
  const actions: AtomicAction[] = base.actions.map((a) => {
    if (a.type !== 'setEffects' || !first || a.id !== first.id || !sig.hook) return a;
    const hook = { id: `look_${sig.id}_hook`, assetId: sig.hook.assetId, overrides: { ...(sig.hook.overrides ?? {}) } };
    return { ...a, effects: [...a.effects, hook] };
  });
  let cuts = 0;
  if (withTransitions && sig.transition && !(state.transitions ?? []).length) {
    const list = shots(state.items);
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1]!; const next = list[i]!;
      if (Math.abs(next.startFrame - (prev.startFrame + prev.durationInFrames)) > 2) continue; // only cuts, not gaps
      actions.push({ type: 'addTransition', id: `sig_${sig.id}_${i}`, incomingItemId: next.id, transType: sig.transition });
      cuts += 1;
    }
  }
  return { actions, clips: base.clips, cuts, label: `Signature: ${sig.name}` };
}
