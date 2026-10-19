import type { TrackId } from './trackTypes.js';

/** transitions with a CSS fallback for non-texturable DOM clips. */
export type CssTransitionType =
  | 'cross-dissolve'
  | 'dip-to-black'
  | 'soft-wipe'
  | 'whip-pan'
  | 'flash'
  | 'luma-blend';

/** these video transitions run their real GLSL for video/image clips. */
export type GlslTransitionType =
  | CssTransitionType
  | 'page-curl'
  | 'rack-focus'
  | 'organic-dissolve'
  | 'impact-shake'
  | 'anticipation-zoom'
  | 'clean-line-wipe'
  | 'circle-wipe'
  | 'radial-blur'
  | 'glitch-cut'
  | 'dip-to-color'
  | 'bars'
  | 'wide-bars'
  | 'window'
  | 'zoom-through'
  | 'whip-blur'
  | 'spin-zoom'
  | 'light-leak'
  | 'chroma-glitch'
  | 'fluted-glass'
  | 'ripple-dissolve'
  | 'tile-pop'
  | 'cube-turn'
  | 'slide-over'
  | 'pixelate'
  | 'film-burn'
  | 'flip-3d'
  | 'mirror-flip'
  | 'prism-flash'
  | 'brush-wipe';

/** Audio-only transitions (preset `trAudioCrossFade`) — no picture. */
export type AudioTransitionType = 'audio-cross-fade';

/** builtin transition ids + extended library transitions + audio + custom shader.
 *  'custom-shader' = a submit_shader-generated transition; its two-input GLSL lives on the
 *  TransitionItem (customFrag), NOT in the exhaustive GLSL_TRANSITIONS record. */
export type TransitionType = GlslTransitionType | AudioTransitionType | 'custom-shader';

export const GLSL_TRANSITION_TYPES: ReadonlySet<string> = new Set<string>([
  'cross-dissolve', 'dip-to-black', 'soft-wipe', 'whip-pan', 'flash', 'luma-blend',
  'page-curl', 'rack-focus', 'organic-dissolve', 'impact-shake', 'anticipation-zoom', 'clean-line-wipe',
  'circle-wipe', 'radial-blur', 'glitch-cut', 'dip-to-color',
  'bars', 'wide-bars', 'window',
  'zoom-through', 'whip-blur', 'spin-zoom', 'light-leak', 'chroma-glitch', 'fluted-glass', 'ripple-dissolve', 'tile-pop', 'cube-turn', 'slide-over',
  'pixelate', 'film-burn', 'flip-3d', 'mirror-flip', 'prism-flash', 'brush-wipe',
  'custom-shader', // takes the GL render path; frag comes from the item, not GLSL_TRANSITIONS
]);

export const CSS_TRANSITION_TYPES: ReadonlySet<string> = new Set<string>([
  'cross-dissolve', 'dip-to-black', 'soft-wipe', 'whip-pan', 'flash', 'luma-blend',
]);

export const AUDIO_TRANSITION_TYPES: ReadonlySet<AudioTransitionType> = new Set<AudioTransitionType>([
  'audio-cross-fade',
]);

export function isAudioTransition(type: TransitionType): type is AudioTransitionType {
  return AUDIO_TRANSITION_TYPES.has(type as AudioTransitionType);
}

export function isVisualTransition(type: TransitionType): type is GlslTransitionType {
  return !isAudioTransition(type);
}

// en labels for the transition library cards (Resource Library·Transition·Screen Transition).
// Shared by the inspector select + the resource-library grid.
export const TRANSITION_LABELS: Record<TransitionType, string> = {
  'anticipation-zoom': 'Push in',
  'clean-line-wipe': 'Line wipe',
  'cross-dissolve': 'Cross dissolve',
  'dip-to-black': 'Dip to black',
  flash: 'Flash',
  'impact-shake': 'Impact shake',
  'luma-blend': 'Luma blend',
  'organic-dissolve': 'Light dissolve',
  'page-curl': 'Page curl',
  'rack-focus': 'Blur focus',
  'soft-wipe': 'Soft wipe',
  'whip-pan': 'Whip pan',
  'circle-wipe': 'Circle wipe',
  'radial-blur': 'Radial blur',
  'glitch-cut': 'Glitch cut',
  'dip-to-color': 'Dip to colour',
  bars: 'Bars break-in',
  'wide-bars': 'Wide bars break-in',
  window: 'Window grow-in',
  'zoom-through': 'Zoom through',
  'whip-blur': 'Whip blur',
  'spin-zoom': 'Spin zoom',
  'light-leak': 'Light leak',
  'chroma-glitch': 'Chromatic glitch',
  'fluted-glass': 'Fluted glass',
  'ripple-dissolve': 'Ripple dissolve',
  'tile-pop': 'Tile pop',
  'cube-turn': 'Cube turn',
  'slide-over': 'Slide over',
  'pixelate': 'Pixel dissolve',
  'film-burn': 'Film burn',
  'flip-3d': '3D spin',
  'mirror-flip': 'Mirror flip',
  'prism-flash': 'Prism flash',
  'brush-wipe': 'Brush wipe',
  /** preset.name.trAudioCrossFade */
  'audio-cross-fade': 'Audio crossfade',
  /** submit_shader-generated custom transition (per-item label in customLabel) */
  'custom-shader': 'Custom shader',
};

/** catalog display order + extended visual transitions. */
export const TRANSITION_ORDER: readonly GlslTransitionType[] = [
  'anticipation-zoom',
  'clean-line-wipe',
  'cross-dissolve',
  'dip-to-black',
  'flash',
  'impact-shake',
  'luma-blend',
  'organic-dissolve',
  'page-curl',
  'rack-focus',
  'soft-wipe',
  'whip-pan',
  'circle-wipe',
  'radial-blur',
  'glitch-cut',
  'dip-to-color',
  'bars',
  'wide-bars',
  'window',
  'zoom-through',
  'whip-blur',
  'spin-zoom',
  'light-leak',
  'chroma-glitch',
  'fluted-glass',
  'ripple-dissolve',
  'tile-pop',
  'cube-turn',
  'slide-over',
  'pixelate',
  'film-burn',
  'flip-3d',
  'mirror-flip',
  'prism-flash',
  'brush-wipe',
];

/** Audio transition catalog (trAudioCrossFade). */
export const AUDIO_TRANSITION_ORDER: readonly AudioTransitionType[] = [
  'audio-cross-fade',
];

/** Reelsmith break-in transitions are short by default (RS-408..410): 0.35 s. */
export const BREAK_IN_TRANSITIONS: ReadonlySet<string> = new Set(['bars', 'wide-bars', 'window']);
export const BREAK_IN_SECONDS = 0.35;

/** Reels transitions (zoom through, whip blur, light leak, ...): each has its own default length, in seconds. */
export const REEL_TRANSITION_SECONDS: Readonly<Record<string, number>> = {
  'zoom-through': 0.4,
  'whip-blur': 0.3,
  'spin-zoom': 0.45,
  'light-leak': 0.6,
  'chroma-glitch': 0.35,
  'fluted-glass': 0.5,
  'ripple-dissolve': 0.55,
  'tile-pop': 0.5,
  'cube-turn': 0.5,
  'slide-over': 0.4,
  'pixelate': 0.4,
  'film-burn': 0.6,
  'flip-3d': 0.45,
  'mirror-flip': 0.3,
  'prism-flash': 0.4,
  'brush-wipe': 0.55,
};

/** Default length in seconds for the transitions Reelsmith added (null = the editor's own default). */
export function defaultTransitionSeconds(type: string): number | null {
  if (BREAK_IN_TRANSITIONS.has(type)) return BREAK_IN_SECONDS;
  return REEL_TRANSITION_SECONDS[type] ?? null;
}

export type TransitionDirection = 'left' | 'right' | 'up' | 'down';

/** an independent transition item straddling the cut between two adjacent
 * same-track clips (transition_item: outgoing→incoming). */
export interface TransitionItem {
  id: string;
  type: TransitionType;
  /** transition length in frames (half retreats into outgoing, half into incoming) */
  durationInFrames: number;
  outgoingItemId: string;
  incomingItemId: string;
  trackId: TrackId;
  enabled?: boolean;
  /** direction for wipe/whip transitions (default 'left') */
  direction?: TransitionDirection;
  /** type='custom-shader' only: the submit_shader-generated two-input transition GLSL,
   *  stored here (not in a registry) so it persists with the project and renders after
   *  reload. customUniforms = {u_<key>: value}; customLabel = display name. */
  customFrag?: string;
  customUniforms?: Record<string, number>;
  customLabel?: string;
}
