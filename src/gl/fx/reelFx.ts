// Reelsmith effects in the style of DaVinci Resolve's film and lens tools: halation, pro-mist, anamorphic flare, light rays,
// zoom blur, lens distortion, film damage, VHS, cartoon ink, water ripple, cinema bars and swirl. Same contract as
// shaderEffects.ts (u_input + u_<key> uniforms, premultiplied-alpha out); multi-pass ones use `pipeline`.
import type { FxPass } from '../runtime';
import type { FxDef } from './uniforms';
import copyFrag from './reel-copy.frag.ts';
import blurFrag from './reel-blur.frag.ts';
import extractFrag from './reel-extract.frag.ts';
import compositeFrag from './reel-glow-composite.frag.ts';
import raysFrag from './reel-rays.frag.ts';
import zoomBlurFrag from './reel-zoom-blur.frag.ts';
import lensDistortionFrag from './reel-lens-distortion.frag.ts';
import filmDamageFrag from './reel-film-damage.frag.ts';
import vhsFrag from './reel-vhs.frag.ts';
import cartoonFrag from './reel-cartoon.frag.ts';
import waterRippleFrag from './reel-water-ripple.frag.ts';
import cinemaBarsFrag from './reel-cinema-bars.frag.ts';
import swirlFrag from './reel-swirl.frag.ts';
import softVignetteFrag from './reel-soft-vignette.frag.ts';
import fineGrainFrag from './reel-fine-grain.frag.ts';

type U = Record<string, number | number[] | boolean>;
const num = (u: U, key: string, fallback: number) => (typeof u[key] === 'number' ? u[key] as number : fallback);

/** copy -> extract highlights -> blur (one or more directional blurs) -> composite over the copy. */
function glowPipeline(u: U, tint: number[], tintAmount: number, blurs: Array<[number, number]>): FxPass[] {
  const passes: FxPass[] = [
    { frag: copyFrag },
    { frag: extractFrag, uniforms: { u_threshold: num(u, 'u_threshold', 0.6), u_knee: num(u, 'u_knee', 0.25), u_tint: tint, u_tintAmount: tintAmount } },
    ...blurs.map(([x, y]) => ({ frag: blurFrag, uniforms: { u_direction: [x, y] } })),
  ];
  passes.push({ frag: compositeFrag, inputFrom: 0, samplers: { u_glow: passes.length - 1 }, uniforms: { u_intensity: num(u, 'u_intensity', 1), u_lift: num(u, 'u_lift', 0) } });
  return passes;
}

export const REEL_FX_EFFECTS: Record<string, FxDef> = {
  'builtin:fx-halation': {
    id: 'builtin:fx-halation',
    name: 'Halation',
    desc: 'The warm red-orange glow film leaves around bright highlights (lights, sky, windows): the signature of cinema film stocks.',
    frag: extractFrag,
    pipeline: (u) => {
      const r = num(u, 'u_radius', 6);
      const warm = num(u, 'u_warmth', 0.85);
      return glowPipeline(u, [1, 0.28, 0.1], warm, [[r, 0], [0, r], [r * 2.5, 0], [0, r * 2.5]]);
    },
    props: [
      { key: 'threshold', label: 'Threshold', default: 0.6, min: 0, max: 1, step: 0.01 },
      { key: 'radius', label: 'Spread', default: 6, min: 1, max: 20, step: 0.5 },
      { key: 'intensity', label: 'Strength', default: 1.1, min: 0, max: 3, step: 0.05 },
      { key: 'warmth', label: 'Red-orange', default: 0.85, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:fx-pro-mist': {
    id: 'builtin:fx-pro-mist',
    name: 'Pro-Mist',
    desc: 'A diffusion-filter glow: highlights bloom softly and the blacks lift slightly, for a dreamy, cinematic skin and light look.',
    frag: extractFrag,
    pipeline: (u) => {
      const r = num(u, 'u_radius', 9);
      return glowPipeline(u, [1, 0.95, 0.9], 0.3, [[r, 0], [0, r], [r * 2.2, 0], [0, r * 2.2]]);
    },
    props: [
      { key: 'threshold', label: 'Threshold', default: 0.3, min: 0, max: 1, step: 0.01 },
      { key: 'radius', label: 'Softness', default: 9, min: 1, max: 24, step: 0.5 },
      { key: 'intensity', label: 'Strength', default: 0.55, min: 0, max: 2, step: 0.05 },
      { key: 'lift', label: 'Lifted blacks', default: 0.03, min: 0, max: 0.15, step: 0.005 },
    ],
  },
  'builtin:fx-anamorphic-flare': {
    id: 'builtin:fx-anamorphic-flare',
    name: 'Anamorphic flare',
    desc: 'Long horizontal blue streaks pulled out of bright lights, like an anamorphic cinema lens.',
    frag: extractFrag,
    pipeline: (u) => {
      const len = num(u, 'u_length', 14);
      const tint = Array.isArray(u.u_color) ? u.u_color as number[] : [0.35, 0.6, 1];
      return glowPipeline({ ...u, u_knee: 0.15, u_lift: 0 }, tint, 1, [[len, 0], [len * 2.6, 0], [len * 6, 0]]);
    },
    props: [
      { key: 'threshold', label: 'Threshold', default: 0.78, min: 0, max: 1, step: 0.01 },
      { key: 'length', label: 'Streak length', default: 14, min: 2, max: 40, step: 0.5 },
      { key: 'intensity', label: 'Strength', default: 2.2, min: 0, max: 5, step: 0.05 },
      { key: 'color', label: 'Streak colour', kind: 'color', default: [0.35, 0.6, 1], uniform: 'u_color' },
    ],
  },
  'builtin:fx-light-rays': {
    id: 'builtin:fx-light-rays',
    name: 'Light rays',
    desc: 'God rays: bright areas stream light outward from a point, like sun through haze or windows.',
    frag: extractFrag,
    pipeline: (u) => [
      { frag: copyFrag },
      { frag: extractFrag, uniforms: { u_threshold: num(u, 'u_threshold', 0.62), u_knee: 0.2, u_tint: [1, 0.9, 0.7], u_tintAmount: num(u, 'u_warmth', 0.5) } },
      { frag: raysFrag, uniforms: { u_lightX: num(u, 'u_lightX', 0.5), u_lightY: num(u, 'u_lightY', 0.85), u_length: num(u, 'u_length', 0.85) } },
      { frag: compositeFrag, inputFrom: 0, samplers: { u_glow: 2 }, uniforms: { u_intensity: num(u, 'u_intensity', 0.9), u_lift: 0 } },
    ],
    props: [
      { key: 'threshold', label: 'Threshold', default: 0.62, min: 0, max: 1, step: 0.01 },
      { key: 'length', label: 'Ray length', default: 0.85, min: 0.1, max: 1, step: 0.01 },
      { key: 'intensity', label: 'Strength', default: 1.5, min: 0, max: 3, step: 0.05 },
      { key: 'lightX', label: 'Light X', default: 0.5, min: -0.5, max: 1.5, step: 0.01 },
      { key: 'lightY', label: 'Light Y', default: 0.9, min: -0.5, max: 1.5, step: 0.01 },
      { key: 'warmth', label: 'Warmth', default: 0.5, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:fx-zoom-blur': {
    id: 'builtin:fx-zoom-blur',
    name: 'Zoom blur',
    desc: 'Radial streaks toward a centre point, the punch-in blur of a fast push on the lens. The centre stays sharp.',
    frag: zoomBlurFrag,
    props: [
      { key: 'amount', label: 'Amount', default: 0.18, min: 0, max: 0.6, step: 0.01 },
      { key: 'centerX', label: 'Centre X', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'centerY', label: 'Centre Y', default: 0.5, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:fx-lens-distortion': {
    id: 'builtin:fx-lens-distortion',
    name: 'Lens distortion',
    desc: 'Barrel or pincushion warp with a red/blue colour fringe that grows toward the edges, like a vintage or wide lens.',
    frag: lensDistortionFrag,
    props: [
      { key: 'distortion', label: 'Distortion (+barrel, -pincushion)', default: 0.22, min: -0.5, max: 0.8, step: 0.01 },
      { key: 'aberration', label: 'Colour fringe', default: 0.1, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:fx-film-damage': {
    id: 'builtin:fx-film-damage',
    name: 'Film damage',
    desc: 'Old projected film: dust specks, vertical scratches, exposure flicker and gate weave, stepping at 24 fps.',
    frag: filmDamageFrag,
    props: [
      { key: 'dust', label: 'Dust', default: 0.7, min: 0, max: 1.5, step: 0.05 },
      { key: 'scratches', label: 'Scratches', default: 0.7, min: 0, max: 1.5, step: 0.05 },
      { key: 'flicker', label: 'Flicker', default: 0.6, min: 0, max: 1.5, step: 0.05 },
      { key: 'weave', label: 'Gate weave', default: 0.8, min: 0, max: 3, step: 0.05 },
    ],
  },
  'builtin:fx-vhs': {
    id: 'builtin:fx-vhs',
    name: 'VHS tape',
    desc: 'Worn tape playback: line wobble, colour bleed, a rolling tracking band, head-switching noise and scanlines.',
    frag: vhsFrag,
    props: [
      { key: 'wobble', label: 'Line wobble', default: 1, min: 0, max: 3, step: 0.05 },
      { key: 'bleed', label: 'Colour bleed', default: 1.2, min: 0, max: 4, step: 0.05 },
      { key: 'noise', label: 'Tape noise', default: 0.8, min: 0, max: 2, step: 0.05 },
      { key: 'tracking', label: 'Tracking band', default: 0.8, min: 0, max: 1, step: 0.05 },
    ],
  },
  'builtin:fx-cartoon': {
    id: 'builtin:fx-cartoon',
    name: 'Cartoon ink',
    desc: 'Flat colour bands with dark ink outlines, like a comic or cel-shaded look.',
    frag: cartoonFrag,
    props: [
      { key: 'levels', label: 'Colour bands', default: 6, min: 2, max: 12, step: 1 },
      { key: 'edge', label: 'Outline strength', default: 1.1, min: 0, max: 4, step: 0.05 },
      { key: 'lineWidth', label: 'Outline width', default: 1.8, min: 0.5, max: 3, step: 0.1 },
      { key: 'saturation', label: 'Saturation', default: 1.3, min: 0, max: 2.5, step: 0.05 },
    ],
  },
  'builtin:fx-water-ripple': {
    id: 'builtin:fx-water-ripple',
    name: 'Water ripple',
    desc: 'The picture wobbles as if seen through moving water or heat haze.',
    frag: waterRippleFrag,
    props: [
      { key: 'amplitude', label: 'Strength', default: 1.4, min: 0, max: 4, step: 0.05 },
      { key: 'frequency', label: 'Wave size', default: 14, min: 2, max: 50, step: 0.5 },
      { key: 'speed', label: 'Speed', default: 2.2, min: 0, max: 8, step: 0.1 },
    ],
  },
  'builtin:fx-cinema-bars': {
    id: 'builtin:fx-cinema-bars',
    name: 'Cinema bars',
    desc: 'Letterbox bars top and bottom for a widescreen cinema frame. Size is each bar as a share of the height.',
    frag: cinemaBarsFrag,
    props: [
      { key: 'size', label: 'Bar size', default: 0.1, min: 0, max: 0.35, step: 0.005 },
      { key: 'softness', label: 'Edge softness', default: 0.002, min: 0, max: 0.05, step: 0.001 },
      { key: 'color', label: 'Bar colour', kind: 'color', default: [0, 0, 0], uniform: 'u_color' },
    ],
  },
  'builtin:fx-fine-grain': {
    id: 'builtin:fx-fine-grain',
    name: 'Fine grain',
    desc: 'Fine monochrome film grain, the same size on portrait and landscape, strongest in the midtones and alive at 24 fps. Use this instead of Film grain on vertical video.',
    frag: fineGrainFrag,
    props: [
      { key: 'strength', label: 'Strength', default: 0.08, min: 0, max: 0.4, step: 0.005 },
      { key: 'size', label: 'Grain size', default: 1.4, min: 0.6, max: 5, step: 0.1 },
    ],
  },
  'builtin:fx-soft-vignette': {
    id: 'builtin:fx-soft-vignette',
    name: 'Soft vignette',
    desc: 'Darkens toward the corners to draw the eye in. Never goes to black, so it is safe at any setting (the plain Vignette cuts to black).',
    frag: softVignetteFrag,
    props: [
      { key: 'strength', label: 'Darkness', default: 0.4, min: 0, max: 1, step: 0.01 },
      { key: 'size', label: 'Clear centre', default: 0.45, min: 0.1, max: 1, step: 0.01 },
      { key: 'softness', label: 'Softness', default: 0.55, min: 0.05, max: 1.2, step: 0.01 },
      { key: 'roundness', label: 'Roundness', default: 0.4, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:fx-swirl': {
    id: 'builtin:fx-swirl',
    name: 'Swirl',
    desc: 'Twists the picture around a point; the twist fades out at the radius.',
    frag: swirlFrag,
    props: [
      { key: 'angle', label: 'Twist', default: 2.2, min: -8, max: 8, step: 0.05 },
      { key: 'radius', label: 'Radius', default: 0.45, min: 0.05, max: 1.2, step: 0.01 },
      { key: 'centerX', label: 'Centre X', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'centerY', label: 'Centre Y', default: 0.5, min: 0, max: 1, step: 0.01 },
    ],
  },
};

/** Library order for the Reels effects: film and lens looks first. */
export const REEL_FX_ORDER = [
  'builtin:fx-halation',
  'builtin:fx-pro-mist',
  'builtin:fx-anamorphic-flare',
  'builtin:fx-light-rays',
  'builtin:fx-zoom-blur',
  'builtin:fx-lens-distortion',
  'builtin:fx-film-damage',
  'builtin:fx-vhs',
  'builtin:fx-cartoon',
  'builtin:fx-water-ripple',
  'builtin:fx-cinema-bars',
  'builtin:fx-soft-vignette',
  'builtin:fx-fine-grain',
  'builtin:fx-swirl',
] as const;
