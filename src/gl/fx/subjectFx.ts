// Subject effects for Reels: effects that need the person cut out of every frame (the matte comes from MediaPipe, see
// ../personMask.ts). They do things ordinary editors can't do without rotoscoping: put doodles behind the person, fill the
// silhouette with another scene, step out clones, make the person glass.
import type { FxDef } from './uniforms';
import silhouetteFrag from './pm-silhouette.frag.ts';
import mixmediaFrag from './pm-mixmedia.frag.ts';
import doubleExposureFrag from './pm-double-exposure.frag.ts';
import echoFrag from './pm-echo-copies.frag.ts';
import popFrag from './pm-subject-pop.frag.ts';
import stickerFrag from './pm-sticker.frag.ts';
import glassFrag from './pm-glass-person.frag.ts';
import predatorFrag from './pm-predator.frag.ts';
import orbitalFrag from './pm-orbital-screens.frag.ts';
import cardFrag from './pm-card-breakout.frag.ts';


/** Every person-matte effect offers this: which cut-out model finds the people (read by ClipFx, not by the shaders). */
const DETECT = { key: 'detect', label: 'Find people (0 one person, sharp / 1 groups and distance)', default: 0, min: 0, max: 1, step: 1 } as const;

const RAW_SUBJECT_FX: Record<string, FxDef> = {
  'builtin:fx-mixmedia-cutout': {
    id: 'builtin:fx-mixmedia-cutout',
    name: 'MixMedia cut-out',
    desc: 'The person cut out like a paper sticker (white edge, soft shadow) on patterned crayon paper, with crayon doodles scribbled behind them and a few over the sticker edge. Redraws at 8 fps like stop-motion. Needs the person cut-out.',
    needsMask: true,
    frag: mixmediaFrag,
    props: [
      { key: 'pattern', label: 'Paper (0 stripes, 1 dots, 2 grid, 3 scribble)', default: 1, min: 0, max: 3, step: 1 },
      { key: 'doodles', label: 'Doodles', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'front', label: 'Doodles over the edge', default: 0.2, min: 0, max: 1, step: 0.01 },
      { key: 'border', label: 'Sticker border', default: 0.012, min: 0, max: 0.04, step: 0.001 },
      { key: 'boil', label: 'Boil', default: 1, min: 0, max: 3, step: 0.05 },
      { key: 'paperA', label: 'Paper colour', kind: 'color', default: [0.99, 0.8, 0.84], uniform: 'u_paperA' },
      { key: 'paperB', label: 'Pattern colour', kind: 'color', default: [1, 0.93, 0.62], uniform: 'u_paperB' },
    ],
  },
  'builtin:fx-double-exposure': {
    id: 'builtin:fx-double-exposure',
    name: 'Double exposure',
    desc: 'The person becomes a silhouette filled with a drifting, zoomed copy of the scene in two ink colours, with the face still reading through, on pale paper. Needs the person cut-out.',
    needsMask: true,
    frag: doubleExposureFrag,
    props: [
      { key: 'zoom', label: 'Scene zoom', default: 1, min: 0.6, max: 4, step: 0.05 },
      { key: 'drift', label: 'Drift', default: 1, min: 0, max: 3, step: 0.05 },
      { key: 'show', label: 'Face showing through', default: 0.55, min: 0, max: 1, step: 0.01 },
      { key: 'scenery', label: 'Scene in the background', default: 0.4, min: 0, max: 1, step: 0.01 },
      { key: 'inkA', label: 'Shadow ink', kind: 'color', default: [0.08, 0.12, 0.35], uniform: 'u_inkA' },
      { key: 'inkB', label: 'Light ink', kind: 'color', default: [1, 0.78, 0.52], uniform: 'u_inkB' },
      { key: 'paper', label: 'Paper', kind: 'color', default: [0.97, 0.95, 0.9], uniform: 'u_paper' },
    ],
  },
  'builtin:fx-echo-copies': {
    id: 'builtin:fx-echo-copies',
    name: 'Echo copies',
    desc: 'Tinted clones of the person step out one per beat into a row on both sides, spread wide, then snap back into them. The real person stays sharp on top. Needs the person cut-out.',
    needsMask: true,
    frag: echoFrag,
    props: [
      { key: 'copies', label: 'Clones', default: 4, min: 1, max: 8, step: 1 },
      { key: 'beat', label: 'Seconds per step', default: 0.5, min: 0.1, max: 2, step: 0.05 },
      { key: 'spread', label: 'Spacing (person widths)', default: 0.8, min: 0.3, max: 2, step: 0.05 },
      { key: 'tint', label: 'Colour tint', default: 0.55, min: 0, max: 1, step: 0.01 },
      { key: 'fade', label: 'Fade with distance', default: 1, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:fx-subject-pop': {
    id: 'builtin:fx-subject-pop',
    name: 'Subject pop',
    desc: 'The person stays vivid with a glowing rim while the background goes dark, desaturated and soft. Needs the person cut-out.',
    needsMask: true,
    frag: popFrag,
    props: [
      { key: 'bgSat', label: 'Background colour', default: 0.15, min: 0, max: 1, step: 0.01 },
      { key: 'bgDim', label: 'Background brightness', default: 0.5, min: 0.1, max: 1, step: 0.01 },
      { key: 'bgBlur', label: 'Background blur', default: 0.006, min: 0, max: 0.03, step: 0.001 },
      { key: 'glow', label: 'Aura', default: 1, min: 0, max: 2.5, step: 0.05 },
      { key: 'rim', label: 'Rim light', default: 1, min: 0, max: 2.5, step: 0.05 },
      { key: 'rimColor', label: 'Glow colour', kind: 'color', default: [0.4, 0.85, 1], uniform: 'u_rimColor' },
    ],
  },
  'builtin:fx-sticker': {
    id: 'builtin:fx-sticker',
    name: 'Sticker cut-out',
    desc: 'The person as a glossy die-cut sticker (thick white border, soft shadow) on a soft, tinted, blurred copy of the scene. Needs the person cut-out.',
    needsMask: true,
    frag: stickerFrag,
    props: [
      { key: 'border', label: 'Border', default: 0.013, min: 0.002, max: 0.04, step: 0.001 },
      { key: 'bgBlur', label: 'Background blur', default: 0.012, min: 0, max: 0.04, step: 0.001 },
      { key: 'bgTint', label: 'Background tint', default: 0.55, min: 0, max: 1, step: 0.01 },
      { key: 'tintColor', label: 'Tint colour', kind: 'color', default: [1, 0.74, 0.86], uniform: 'u_tintColor' },
    ],
  },
  'builtin:fx-glass-person': {
    id: 'builtin:fx-glass-person',
    name: 'Glass person',
    desc: 'The person turns to liquid glass: inside the silhouette you see the background from beside them, refracted with colour fringes, a bright rim and drifting highlights. Needs the person cut-out.',
    needsMask: true,
    frag: glassFrag,
    props: [
      { key: 'refract', label: 'Refraction', default: 1, min: 0, max: 3, step: 0.05 },
      { key: 'fringe', label: 'Colour fringe', default: 0.35, min: 0, max: 1, step: 0.01 },
      { key: 'rim', label: 'Rim light', default: 1, min: 0, max: 2.5, step: 0.05 },
      { key: 'tint', label: 'Glass tint', default: 0.7, min: 0, max: 1, step: 0.01 },
    ],
  },
  'builtin:fx-predator': {
    id: 'builtin:fx-predator',
    name: 'Predator vision',
    desc: 'The person glows hot (white core, orange and red edges) on a cold, dark blue scene with scanlines and sensor noise. Needs the person cut-out.',
    needsMask: true,
    frag: predatorFrag,
    props: [
      { key: 'heat', label: 'Body heat', default: 1, min: 0.2, max: 1.5, step: 0.05 },
      { key: 'cold', label: 'Scene detail', default: 1, min: 0, max: 2, step: 0.05 },
      { key: 'scan', label: 'Scanlines', default: 1, min: 0, max: 1.5, step: 0.05 },
    ],
  },
  'builtin:fx-orbital-screens': {
    id: 'builtin:fx-orbital-screens',
    name: 'Orbital screens',
    desc: 'Small glass screens, each showing its own crop of the video, orbit the person on a tilted ring, passing behind them and in front. Needs the person cut-out.',
    needsMask: true,
    frag: orbitalFrag,
    props: [
      { key: 'count', label: 'Screens', default: 5, min: 1, max: 8, step: 1 },
      { key: 'speed', label: 'Speed', default: 0.8, min: 0, max: 3, step: 0.05 },
      { key: 'size', label: 'Screen size', default: 0.2, min: 0.06, max: 0.34, step: 0.005 },
      { key: 'ring', label: 'Ring width', default: 1.15, min: 0.5, max: 2, step: 0.05 },
      { key: 'tilt', label: 'Ring tilt', default: 1, min: 0, max: 2.5, step: 0.05 },
    ],
  },
  'builtin:fx-card-breakout': {
    id: 'builtin:fx-card-breakout',
    name: 'Card breakout',
    desc: 'The video shrinks into a rounded card on a dark background and the person steps out of it: full size, overlapping the card edges, while the rest of the scene stays boxed in. Needs the person cut-out.',
    needsMask: true,
    frag: cardFrag,
    props: [
      { key: 'card', label: 'Card size', default: 0.74, min: 0.3, max: 0.95, step: 0.01 },
      { key: 'radius', label: 'Corner radius', default: 0.05, min: 0, max: 0.15, step: 0.005 },
      { key: 'pulse', label: 'Breathing', default: 1, min: 0, max: 3, step: 0.05 },
      { key: 'backColor', label: 'Background', kind: 'color', default: [0.04, 0.04, 0.06], uniform: 'u_backColor' },
    ],
  },
  'builtin:fx-silhouette': {
    id: 'builtin:fx-silhouette',
    name: 'Silhouette',
    desc: 'The person as a flat colour shape on a colour background, for a graphic poster look. Needs the person cut-out.',
    needsMask: true,
    frag: silhouetteFrag,
    props: [
      { key: 'edge', label: 'Edge softness', default: 0.08, min: 0.01, max: 0.4, step: 0.01 },
      { key: 'texture', label: 'Halftone texture', default: 0.6, min: 0, max: 1, step: 0.05 },
      { key: 'keepDetail', label: 'Keep detail in the shape', default: 0.3, min: 0, max: 1, step: 0.05 },
      { key: 'subjectColor', label: 'Person colour', kind: 'color', default: [0.1, 0.1, 0.16], uniform: 'u_subjectColor' },
      { key: 'backColor', label: 'Background top', kind: 'color', default: [1, 0.83, 0.4], uniform: 'u_backColor' },
      { key: 'backColor2', label: 'Background bottom', kind: 'color', default: [1, 0.45, 0.4], uniform: 'u_backColor2' },
    ],
  },
};

export const SUBJECT_FX_EFFECTS: Record<string, FxDef> = Object.fromEntries(
  Object.entries(RAW_SUBJECT_FX).map(([id, def]) => [id, { ...def, props: [...def.props, DETECT] }]),
);

export const SUBJECT_FX_ORDER = [
  'builtin:fx-mixmedia-cutout',
  'builtin:fx-double-exposure',
  'builtin:fx-echo-copies',
  'builtin:fx-subject-pop',
  'builtin:fx-sticker',
  'builtin:fx-glass-person',
  'builtin:fx-predator',
  'builtin:fx-orbital-screens',
  'builtin:fx-card-breakout',
  'builtin:fx-silhouette',
] as const;
