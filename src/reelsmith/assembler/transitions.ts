// RS-412: per-cut transitions named by the recipe. A section's `transition` is one of the names below or "auto",
// which rotates through a list (default: bars, wide bars, window, flash) so no style repeats back to back.
// An optional recipe param (assembler.options.transitionParam) lets the user override the whole reel in the setup form.
import type { AtomicAction } from '../../editor/reducerActions';
import type { TransitionType } from '../../editor/types';
import { stableId } from './rng';
import type { PlannedShot } from './types';

export const AUTO_TRANSITIONS = ['bars', 'wide-bars', 'window', 'flash'] as const;

interface Spec { type: TransitionType; seconds: number }
/** Recipe names -> editor transitions. `cut` is absent: no transition item. */
export const RECIPE_TRANSITIONS: Record<string, Spec> = {
  crossfade: { type: 'cross-dissolve', seconds: 0.4 },
  dipToBlack: { type: 'dip-to-black', seconds: 0.4 },
  dipToWhite: { type: 'flash', seconds: 0.3 },
  flash: { type: 'flash', seconds: 0.15 },
  slideLeft: { type: 'whip-pan', seconds: 0.3 },
  slideUp: { type: 'whip-pan', seconds: 0.3 },
  pushLeft: { type: 'whip-pan', seconds: 0.3 },
  zoomIn: { type: 'anticipation-zoom', seconds: 0.4 },
  bars: { type: 'bars', seconds: 0.35 },
  'wide-bars': { type: 'wide-bars', seconds: 0.35 },
  window: { type: 'window', seconds: 0.35 },
  'zoom-through': { type: 'zoom-through', seconds: 0.4 },
  'whip-blur': { type: 'whip-blur', seconds: 0.3 },
  'spin-zoom': { type: 'spin-zoom', seconds: 0.45 },
  'light-leak': { type: 'light-leak', seconds: 0.6 },
  'chroma-glitch': { type: 'chroma-glitch', seconds: 0.35 },
  'fluted-glass': { type: 'fluted-glass', seconds: 0.5 },
  'ripple-dissolve': { type: 'ripple-dissolve', seconds: 0.55 },
  'tile-pop': { type: 'tile-pop', seconds: 0.5 },
  'cube-turn': { type: 'cube-turn', seconds: 0.5 },
  'slide-over': { type: 'slide-over', seconds: 0.4 },
};

export interface TransitionContext {
  options?: Record<string, unknown>;
  params: Record<string, string | number | boolean>;
  seed: number;
  fps: number;
  /** the recipe keeps the older solid flash accents (param flashOnBars) for `flash` sections */
  legacyFlash: boolean;
}

/**
 * The transition into each shot (null = hard cut). Shot 0 never has one. `auto` cuts rotate through the list,
 * starting at an offset from the seed; with an override param set to a single name that name is used instead.
 */
export function pickTransitions(shots: PlannedShot[], ctx: TransitionContext): Array<string | null> {
  const listOpt = ctx.options?.autoTransitions;
  const list = (Array.isArray(listOpt) ? listOpt.filter((x): x is string => typeof x === 'string' && x in RECIPE_TRANSITIONS) : []).length
    ? (listOpt as string[]).filter((x) => x in RECIPE_TRANSITIONS)
    : [...AUTO_TRANSITIONS];
  const paramId = typeof ctx.options?.transitionParam === 'string' ? ctx.options.transitionParam : undefined;
  const override = paramId ? String(ctx.params[paramId] ?? 'auto') : 'auto';
  let rotation = Math.abs(Math.trunc(ctx.seed)) % list.length;
  return shots.map((shot, i) => {
    if (i === 0 || !shot.transition) return null;
    let name = shot.transition;
    if (name === 'auto') {
      if (override === 'cut') return null;
      name = override !== 'auto' ? override : list[rotation++ % list.length]!;
    }
    if (name === 'cut' || !(name in RECIPE_TRANSITIONS)) return null;
    if (name === 'flash' && ctx.legacyFlash) return null;
    return name;
  });
}

/** addTransition actions for the picked names. `ids[i]` is the clip id of shot i; neighbours must be adjacent. */
export function transitionActions(shots: PlannedShot[], ids: string[], names: Array<string | null>, ctx: TransitionContext, tag: string, scope: string | number): AtomicAction[] {
  const out: AtomicAction[] = [];
  names.forEach((name, i) => {
    if (!name || i === 0) return;
    const prev = shots[i - 1]!;
    const shot = shots[i]!;
    if (prev.startFrame + prev.durationInFrames < shot.startFrame - 2) return; // not adjacent
    const spec = RECIPE_TRANSITIONS[name]!;
    const length = Math.max(2, Math.min(Math.round(spec.seconds * ctx.fps), prev.durationInFrames, shot.durationInFrames));
    out.push({ type: 'addTransition', id: stableId('rs-tr', tag, scope, i), incomingItemId: ids[i]!, transType: spec.type, durationInFrames: length });
  });
  return out;
}
