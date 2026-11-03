// Registry of the GLSL transitions (builtin:tr-*), mapping our
// TransitionType → fragment source + default uniforms. Defaults follow the
// (name, default, min, max) table in shaders/README.md; the vec3
// color defaults aren't in that table — chosen by eye.
import type { GlslTransitionType, TransitionDirection } from '../editor/types';
import type { UniformValue } from './runtime';
import pageCurl from './shaders/page-curl.frag.ts';
import rackFocus from './shaders/rack-focus.frag.ts';
import organicDissolve from './shaders/organic-dissolve.frag.ts';
import impactShake from './shaders/impact-shake.frag.ts';
import anticipationZoom from './shaders/anticipation-zoom.frag.ts';
import cleanLineWipe from './shaders/clean-line-wipe.frag.ts';
import crossDissolve from './shaders/cross-dissolve.frag.ts';
import dipToBlack from './shaders/dip-to-black.frag.ts';
import flash from './shaders/flash.frag.ts';
import lumaBlend from './shaders/luma-blend.frag.ts';
import softWipe from './shaders/soft-wipe.frag.ts';
import whipPan from './shaders/whip-pan.frag.ts';
import circleWipe from './shaders/circle-wipe.frag.ts';
import radialBlur from './shaders/radial-blur.frag.ts';
import glitchCut from './shaders/glitch-cut.frag.ts';
import dipToColor from './shaders/dip-to-color.frag.ts';
import bars from './shaders/bars.frag.ts';
import windowGrow from './shaders/window.frag.ts';
import zoomThrough from './shaders/zoom-through.frag.ts';
import whipBlur from './shaders/whip-blur.frag.ts';
import spinZoom from './shaders/spin-zoom.frag.ts';
import lightLeak from './shaders/light-leak.frag.ts';
import chromaGlitch from './shaders/chroma-glitch.frag.ts';
import flutedGlass from './shaders/fluted-glass.frag.ts';
import rippleDissolve from './shaders/ripple-dissolve.frag.ts';
import tilePop from './shaders/tile-pop.frag.ts';
import cubeTurn from './shaders/cube-turn.frag.ts';
import slideOver from './shaders/slide-over.frag.ts';
import pixelate from './shaders/pixelate.frag.ts';
import filmBurn from './shaders/film-burn.frag.ts';
import flip3d from './shaders/flip-3d.frag.ts';
import mirrorFlip from './shaders/mirror-flip.frag.ts';
import prismFlash from './shaders/prism-flash.frag.ts';
import brushWipe from './shaders/brush-wipe.frag.ts';
import silhouettePortal from './shaders/silhouette-portal.frag.ts';
import { GLT_FRAGS } from './shaders/glt/frags.ts';
import { GLT_TRANSITIONS, type GltTransitionId } from '../reelsmith/glTransitionsMeta';

export interface GlslTransitionDef {
  frag: string;
  /** per-frame uniforms beyond u_progress/u_resolution/u_aspect */
  uniforms: (ctx: { time: number; aspect: number; direction: TransitionDirection }) => Record<string, UniformValue>;
  /** Reelsmith: the shader reads u_mask, the outgoing frame's person matte, and the u_hasPerson / u_subject* uniforms
   *  (GlTransition fills them per frame; the defaults from uniforms() mean "nobody found"). */
  needsMask?: boolean;
}

export const GLSL_TRANSITIONS: Record<GlslTransitionType, GlslTransitionDef> = {
  'cross-dissolve': {
    frag: crossDissolve,
    uniforms: () => ({ u_easingAmount: 1 }),
  },
  'dip-to-black': {
    frag: dipToBlack,
    uniforms: () => ({ u_blackDuration: 0.2 }),
  },
  flash: {
    frag: flash,
    uniforms: () => ({ u_flashColor: [1, 1, 1], u_flashHold: 0.1, u_overexposure: 2 }),
  },
  'luma-blend': {
    frag: lumaBlend,
    uniforms: () => ({ u_intensity: 2, u_additiveAmount: 0.5, u_threshold: 0.3 }),
  },
  'soft-wipe': {
    frag: softWipe,
    uniforms: () => ({ u_feather: 0.4, u_parallax: 0.05 }),
  },
  'whip-pan': {
    frag: whipPan,
    uniforms: ({ direction }) => ({
      u_dir: direction === 'right' ? [-1, 0] : direction === 'up' ? [0, -1] : direction === 'down' ? [0, 1] : [1, 0],
      u_blurStrength: 0.15,
      u_bounceback: 0.1,
    }),
  },
  'page-curl': {
    frag: pageCurl,
    uniforms: () => ({
      u_radius: 0.12, // Ai default [0.02, 0.5]
      u_glossiness: 0.6, // Ai default [0, 1]
      u_paperTint: [0.97, 0.95, 0.9], // Paper back color (customized)
    }),
  },
  'rack-focus': {
    frag: rackFocus,
    uniforms: () => ({
      u_blurStrength: 0.5, // Ai default [0, 1]
      u_chromaticAberration: 0.4, // Ai default [0, 1]
      u_contrastLoss: 0.2, // Ai default [0, 1]
    }),
  },
  'organic-dissolve': {
    frag: organicDissolve,
    uniforms: ({ time, aspect }) => ({
      u_ratio: aspect,
      u_time: time,
      u_glowWidth: 0.05, // Ai default [0, 0.5]
      u_depth: 1.8, // Ai default [0.1, 4]
      u_glowColor: [1.0, 0.55, 0.18], // Burning edge orange (customized)
    }),
  },
  'impact-shake': {
    frag: impactShake,
    uniforms: () => ({
      u_shakeIntensity: 0.03, // Ai default [0, 0.2]
      u_zoomPunch: 1.08, // Ai default [1, 2]
      u_chromaticAmount: 0.01, // Ai default [0, 0.1]
    }),
  },
  'anticipation-zoom': {
    frag: anticipationZoom,
    uniforms: () => ({
      u_windupAmount: 0.15, // Ai default [0, 1]
      u_zoomAmount: 6, // Ai default [0, 20]
      u_incomingStartScale: 0.8, // Ai default [0.1, 1]
    }),
  },
  'clean-line-wipe': {
    frag: cleanLineWipe,
    uniforms: () => ({
      u_lineWidth: 0.006, // Thin bright line width (customized)
      u_lineColor: [1, 1, 1], // Custom
    }),
  },
  // ── Extended generated library ──────────────────────────────────────────
  'circle-wipe': {
    frag: circleWipe,
    uniforms: () => ({
      u_feather: 0.04,
      u_center: [0.5, 0.5],
    }),
  },
  'radial-blur': {
    frag: radialBlur,
    uniforms: () => ({
      u_blurStrength: 0.22,
      u_center: [0.5, 0.5],
    }),
  },
  'glitch-cut': {
    frag: glitchCut,
    uniforms: ({ time }) => ({
      u_intensity: 1,
      u_time: time,
    }),
  },
  'dip-to-color': {
    frag: dipToColor,
    uniforms: () => ({
      // warm brand flash — bright enough to read on dark library cards
      u_color: [0.95, 0.38, 0.14],
      // short hold so PREVIEW_PROGRESS (~0.42) still shows outgoing + color blend
      u_hold: 0.12,
    }),
  },
  // ── Reelsmith break-ins (RS-408..410) ───────────────────────────────────
  bars: {
    frag: bars,
    // vertical bars sliding up/down; left/right (the default) alternates
    uniforms: ({ direction }) => ({
      u_count: 6, u_stagger: 0.5, u_horizontal: 0,
      u_dir: direction === 'up' ? 1 : direction === 'down' ? -1 : 0,
    }),
  },
  'wide-bars': {
    frag: bars,
    // 3 wide bars: left/right = horizontal rows sliding sideways (default), up/down = vertical columns
    uniforms: ({ direction }) => ({
      u_count: 3, u_stagger: 0.4,
      u_horizontal: direction === 'up' || direction === 'down' ? 0 : 1,
      u_dir: direction === 'up' || direction === 'right' ? 1 : direction === 'down' ? -1 : 0,
    }),
  },
  window: {
    frag: windowGrow,
    uniforms: ({ aspect }) => ({
      u_center: [0.5, 0.5], u_start: 0.3, u_limit: WINDOW_LIMIT, u_radius: 0.03, u_shadow: 0.5, u_aspect: aspect,
    }),
  },
  // ── Reels transitions (zoom through, whip blur, ...) ────────────────────
  'zoom-through': {
    frag: zoomThrough,
    uniforms: () => ({ u_zoom: 1.1, u_blur: 0.5, u_split: 0.12, u_center: [0.5, 0.5] }),
  },
  'whip-blur': {
    frag: whipBlur,
    uniforms: ({ direction }) => ({ u_dir: motionDir(direction), u_blur: 0.35, u_split: 1 }),
  },
  'spin-zoom': {
    frag: spinZoom,
    uniforms: ({ aspect, direction }) => ({ u_aspect: aspect, u_angle: 0.5, u_zoom: 0.9, u_blur: 0.6, u_dir: direction === 'right' || direction === 'down' ? -1 : 1 }),
  },
  'light-leak': {
    frag: lightLeak,
    uniforms: ({ aspect, direction }) => ({ u_dir: motionDir(direction), u_intensity: 0.95, u_aspect: aspect }),
  },
  'chroma-glitch': {
    frag: chromaGlitch,
    uniforms: () => ({ u_intensity: 1, u_bands: 26 }),
  },
  'fluted-glass': {
    frag: flutedGlass,
    uniforms: () => ({ u_ribs: 9, u_refract: 0.4, u_split: 0.1 }),
  },
  'ripple-dissolve': {
    frag: rippleDissolve,
    uniforms: ({ aspect }) => ({ u_aspect: aspect, u_center: [0.5, 0.5], u_amp: 0.045, u_freq: 38 }),
  },
  'tile-pop': {
    frag: tilePop,
    uniforms: ({ aspect }) => ({ u_aspect: aspect, u_cols: 5, u_round: 0.8 }),
  },
  'cube-turn': {
    frag: cubeTurn,
    uniforms: ({ direction }) => ({
      u_vertical: direction === 'up' || direction === 'down' ? 1 : 0,
      u_sign: direction === 'right' || direction === 'up' ? -1 : 1,
      u_depth: 0.28,
    }),
  },
  'slide-over': {
    frag: slideOver,
    uniforms: ({ direction }) => ({ u_dir: motionDir(direction), u_parallax: 0.3, u_shadow: 0.5 }),
  },
  pixelate: {
    frag: pixelate,
    uniforms: ({ aspect }) => ({ u_aspect: aspect, u_blocks: 14 }),
  },
  'film-burn': {
    frag: filmBurn,
    // the burn starts in the corner the motion comes from: left = from the right edge, as the other directional transitions
    uniforms: ({ aspect, time, direction }) => ({
      u_aspect: aspect, u_time: time,
      u_origin: direction === 'right' ? [0.0, 0.85] : direction === 'up' ? [0.5, 0.0] : direction === 'down' ? [0.5, 1.0] : [1.0, 0.85],
    }),
  },
  'flip-3d': {
    frag: flip3d,
    uniforms: ({ aspect, direction }) => ({ u_aspect: aspect, u_vertical: direction === 'up' || direction === 'down' ? 1 : 0, u_sign: direction === 'right' || direction === 'up' ? -1 : 1 }),
  },
  'mirror-flip': {
    frag: mirrorFlip,
    uniforms: ({ direction }) => ({ u_vertical: direction === 'up' || direction === 'down' ? 1 : 0 }),
  },
  'prism-flash': {
    frag: prismFlash,
    // left (default) sweeps right to left, slightly diagonal
    uniforms: ({ aspect, direction }) => ({ u_aspect: aspect, u_angle: direction === 'right' ? 0.35 : direction === 'up' ? 1.5708 + 0.35 : direction === 'down' ? -1.5708 + 0.35 : 3.14159 + 0.35 }),
  },
  'brush-wipe': {
    frag: brushWipe,
    uniforms: () => ({ u_strokes: 4 }),
  },
  // RS-1262: the next shot inside the person's outline, growing to fill the frame; a circle wipe when nobody is clear
  'silhouette-portal': {
    frag: silhouettePortal,
    needsMask: true,
    uniforms: ({ aspect }) => ({ u_aspect: aspect, u_hasPerson: 0, u_subjectCenter: [0.5, 0.5], u_subjectSize: [0.4, 0.6] }),
  },
  // Reelsmith: imported GL Transitions (shaders/glt), tuned values are constants in the shader
  ...(Object.fromEntries(GLT_TRANSITIONS.map((t) => [t.id, { frag: GLT_FRAGS[t.id], uniforms: ({ aspect }: { aspect: number }) => ({ u_aspect: aspect }) }])) as unknown as Record<GltTransitionId, GlslTransitionDef>),
};

/** The way the strip moves for a direction, the same sense as whip-pan: left = the next shot comes in from the right. */
function motionDir(direction: TransitionDirection): [number, number] {
  return direction === 'right' ? [-1, 0] : direction === 'up' ? [0, -1] : direction === 'down' ? [0, 1] : [1, 0];
}

/** Half width / half height the window reaches at 80% of the transition: inside Instagram's safe zone (top/bottom/right bands). */
export const WINDOW_LIMIT: [number, number] = [0.4, 0.3];
