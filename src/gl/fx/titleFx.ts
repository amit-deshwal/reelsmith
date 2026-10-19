// Title effects for Reels: effects that write a title over the footage. Unlike the person effects they need no cut-out; the title
// is drawn by the renderer (see ../textLayer.ts) and the shader gives it its look.
import type { FxDef } from './uniforms';
import titleRevealFrag from './pm-title-reveal.frag.ts';
import sceneryFrag from './reel-text-scenery.frag.ts';
import { TITLE_WORDS, titleLabel } from '../titleText';

export const TITLE_FX_EFFECTS: Record<string, FxDef> = {
  'builtin:fx-title-reveal': {
    id: 'builtin:fx-title-reveal',
    name: 'Movie title reveal',
    desc: `A heavy, cracked and chipped weathered-steel title (the picture shows through it) inside a disc of dark, segmented glass rings cut from your footage, blended into a cinematic reveal: the rings open from the centre and settle as the title lands (titles: ${TITLE_WORDS.map((w, i) => `${i} ${titleLabel(w)}`).join(', ')}). Put it on the first clip; the footage outside the glass is darkened.`,
    needsText: true,
    textKind: 'title',
    frag: titleRevealFrag,
    props: [
      { key: 'word', label: `Title (0 ${titleLabel(TITLE_WORDS[0])} … ${TITLE_WORDS.length - 1} ${titleLabel(TITLE_WORDS[TITLE_WORDS.length - 1]!)})`, default: 0, min: 0, max: TITLE_WORDS.length - 1, step: 1 },
      { key: 'reveal', label: 'Reveal length (seconds)', default: 1.6, min: 0.3, max: 4, step: 0.05 },
      { key: 'rings', label: 'Glass rings', default: 5, min: 3, max: 10, step: 1 },
      { key: 'glass', label: 'Glass bend', default: 0.8, min: 0, max: 2, step: 0.05 },
      { key: 'twist', label: 'Spiral twist', default: 1, min: 0, max: 2, step: 0.05 },
      { key: 'span', label: 'Ring disc size', default: 1.15, min: 0.5, max: 1.6, step: 0.01 },
      { key: 'size', label: 'Title width', default: 0.94, min: 0.4, max: 0.98, step: 0.01 },
      { key: 'wear', label: 'Weathering', default: 0.85, min: 0, max: 1, step: 0.01 },
      { key: 'dim', label: 'Darken outside the glass', default: 0.3, min: 0, max: 0.9, step: 0.01 },
      { key: 'steel', label: 'Steel tone', kind: 'color', default: [0.66, 0.63, 0.57], uniform: 'u_steel' },
    ],
  },
  'builtin:fx-text-scenery': {
    id: 'builtin:fx-text-scenery',
    name: 'Landscape title',
    desc: 'Thin, widely spaced capitals rise into the sky from behind the scenery and settle there; ridges, trees and people stay in front of the letters. Best on a wide view with open sky. The text is the clip\'s title (set by the director).',
    needsText: true,
    textKind: 'scenery',
    frag: sceneryFrag,
    props: [
      { key: 'y', label: 'Height in the frame (0 top, 1 bottom)', default: 0.2, min: 0.05, max: 0.6, step: 0.01 },
      { key: 'size', label: 'Letter height', default: 0.09, min: 0.03, max: 0.25, step: 0.005 },
      { key: 'opacity', label: 'Opacity', default: 0.75, min: 0.1, max: 1, step: 0.01 },
      { key: 'rise', label: 'Rise (seconds)', default: 1.8, min: 0.2, max: 5, step: 0.05 },
      { key: 'delay', label: 'Delay (seconds)', default: 0.2, min: 0, max: 5, step: 0.05 },
      { key: 'outline', label: 'Hollow outline (1) or solid (0)', default: 1, min: 0, max: 1, step: 1 },
      { key: 'sky', label: 'How easily the picture counts as sky', default: 0.5, min: 0, max: 1, step: 0.01 },
    ],
  },
};

export const TITLE_FX_ORDER = ['builtin:fx-title-reveal', 'builtin:fx-text-scenery'] as const;
