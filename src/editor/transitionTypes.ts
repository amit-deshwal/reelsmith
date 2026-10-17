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
  | 'slide-over';

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
  'anticipation-zoom': '推进转场',
  'clean-line-wipe': '白色划线转场',
  'cross-dissolve': '叠化转场',
  'dip-to-black': '闪黑转场',
  flash: '闪白转场',
  'impact-shake': '冲击抖动转场',
  'luma-blend': '叠加转场',
  'organic-dissolve': '光溶转场',
  'page-curl': '翻页转场',
  'rack-focus': '焦点转场',
  'soft-wipe': '柔化擦除转场',
  'whip-pan': '甩镜转场',
  'circle-wipe': '圆形擦除转场',
  'radial-blur': '径向模糊转场',
  'glitch-cut': '故障切换转场',
  'dip-to-color': '闪色转场',
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
  /** preset.name.trAudioCrossFade */
  'audio-cross-fade': '音频交叉淡化',
  /** submit_shader-generated custom transition (per-item label in customLabel) */
  'custom-shader': '自定义着色器转场',
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
