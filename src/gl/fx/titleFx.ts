// Title effects for Reels: effects that write a title over the footage. Unlike the person effects they need no cut-out; the title
// is drawn by the renderer (see ../textLayer.ts) and the shader gives it its look.
import type { FxDef } from './uniforms';
import titleRevealFrag from './pm-title-reveal.frag.ts';
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
};

export const TITLE_FX_ORDER = ['builtin:fx-title-reveal'] as const;
