// RS-412: per-cut transitions by name. A director section's `transition` is one of the names below.
import type { AtomicAction } from '../../editor/reducerActions';
import type { TransitionDirection, TransitionType } from '../../editor/types';
import { GLT_TRANSITIONS } from '../glTransitionsMeta';

interface Spec { type: TransitionType; seconds: number; /** set on the transition after it is added (whip-blur up/down) */ direction?: TransitionDirection }
/** Recipe names -> editor transitions. `cut` is absent: no transition item. */
export const RECIPE_TRANSITIONS: Record<string, Spec> = {
  crossfade: { type: 'cross-dissolve', seconds: 0.4 },
  dipToBlack: { type: 'dip-to-black', seconds: 0.4 },
  dipToWhite: { type: 'flash', seconds: 0.3 },
  flash: { type: 'flash', seconds: 0.15 },
  slideLeft: { type: 'whip-pan', seconds: 0.3 },
  slideUp: { type: 'whip-pan', seconds: 0.3, direction: 'up' },
  pushLeft: { type: 'whip-pan', seconds: 0.3 },
  zoomIn: { type: 'anticipation-zoom', seconds: 0.4 },
  bars: { type: 'bars', seconds: 0.35 },
  'wide-bars': { type: 'wide-bars', seconds: 0.35 },
  window: { type: 'window', seconds: 0.35 },
  'zoom-through': { type: 'zoom-through', seconds: 0.4 },
  'whip-blur': { type: 'whip-blur', seconds: 0.3 },
  // the feed swipe of Reels and mobile editors: a motion-blurred whip up (or down) to the next shot
  'swipe-up': { type: 'whip-blur', seconds: 0.3, direction: 'up' },
  'swipe-down': { type: 'whip-blur', seconds: 0.3, direction: 'down' },
  'spin-zoom': { type: 'spin-zoom', seconds: 0.45 },
  'light-leak': { type: 'light-leak', seconds: 0.6 },
  'chroma-glitch': { type: 'chroma-glitch', seconds: 0.35 },
  'fluted-glass': { type: 'fluted-glass', seconds: 0.5 },
  'ripple-dissolve': { type: 'ripple-dissolve', seconds: 0.55 },
  'tile-pop': { type: 'tile-pop', seconds: 0.5 },
  'cube-turn': { type: 'cube-turn', seconds: 0.5 },
  'slide-over': { type: 'slide-over', seconds: 0.4 },
  'pixelate': { type: 'pixelate', seconds: 0.4 },
  'film-burn': { type: 'film-burn', seconds: 0.6 },
  'flip-3d': { type: 'flip-3d', seconds: 0.45 },
  'mirror-flip': { type: 'mirror-flip', seconds: 0.3 },
  'prism-flash': { type: 'prism-flash', seconds: 0.4 },
  'brush-wipe': { type: 'brush-wipe', seconds: 0.55 },
  ...Object.fromEntries(GLT_TRANSITIONS.map((t) => [t.id, { type: t.id, seconds: t.seconds }])),
  // the editor's own transitions, for the director
  'blur-focus': { type: 'rack-focus', seconds: 0.45 },
  'radial-blur': { type: 'radial-blur', seconds: 0.4 },
  'page-curl': { type: 'page-curl', seconds: 0.6 },
  'circle-wipe': { type: 'circle-wipe', seconds: 0.45 },
  'light-dissolve': { type: 'organic-dissolve', seconds: 0.6 },
  'impact-shake': { type: 'impact-shake', seconds: 0.35 },
  'glitch-cut': { type: 'glitch-cut', seconds: 0.3 },
  'line-wipe': { type: 'clean-line-wipe', seconds: 0.45 },
  'luma-blend': { type: 'luma-blend', seconds: 0.5 },
};

/** The addTransition for a recipe name, followed by its direction when the name carries one (addTransition has no direction). */
export function addRecipeTransition(spec: Spec, add: Extract<AtomicAction, { type: 'addTransition' }>): AtomicAction[] {
  return spec.direction ? [add, { type: 'setTransition', id: add.id, patch: { direction: spec.direction } }] : [add];
}
