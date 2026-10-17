// Mixed-media and hand-made effects for Reels: crayon, scrapbook paper, crayon doodles, cut paper, pencil sketch, watercolor,
// risograph, thermal vision and frame division. They work on the whole frame (no subject cut-out needed) and the hand-drawn ones
// boil at 8 fps like stop-motion. Same contract as shaderEffects.ts.
import type { FxDef } from './uniforms';
import crayonFrag from './mm-crayon.frag.ts';
import scrapbookFrag from './mm-scrapbook-paper.frag.ts';
import doodlesFrag from './mm-doodles.frag.ts';
import paperCutFrag from './mm-paper-cut.frag.ts';
import pencilFrag from './mm-pencil-sketch.frag.ts';
import watercolorFrag from './mm-watercolor.frag.ts';
import risoFrag from './mm-riso.frag.ts';
import thermalFrag from './mm-thermal.frag.ts';
import slabFrag from './mm-slab-mosaic.frag.ts';

export const MIXED_MEDIA_EFFECTS: Record<string, FxDef> = {
  'builtin:fx-crayon': {
    id: 'builtin:fx-crayon',
    name: 'Crayon',
    desc: 'The picture redrawn in wax crayon on cream paper: flat colour bands, diagonal strokes with paper showing through, crayon outlines and a hand-made boil.',
    frag: crayonFrag,
    props: [
      { key: 'wax', label: 'Waxy colour', default: 0.75, min: 0, max: 1, step: 0.01 },
      { key: 'bands', label: 'Colour bands', default: 6, min: 2, max: 14, step: 1 },
      { key: 'outline', label: 'Outline', default: 1, min: 0, max: 2, step: 0.05 },
      { key: 'boil', label: 'Boil', default: 1, min: 0, max: 3, step: 0.05 },
    ],
  },
  'builtin:fx-scrapbook-paper': {
    id: 'builtin:fx-scrapbook-paper',
    name: 'Scrapbook paper',
    desc: 'The clip becomes a taped, slightly tilted photo with a white border and soft shadow, pasted on patterned paper (stripes, dots, grid or crayon scribble).',
    frag: scrapbookFrag,
    props: [
      { key: 'pattern', label: 'Paper (0 stripes, 1 dots, 2 grid, 3 scribble)', default: 1, min: 0, max: 3, step: 1 },
      { key: 'size', label: 'Photo size', default: 0.78, min: 0.4, max: 0.95, step: 0.01 },
      { key: 'tilt', label: 'Tilt (degrees)', default: 3, min: -10, max: 10, step: 0.1 },
      { key: 'border', label: 'White border', default: 0.025, min: 0, max: 0.08, step: 0.001 },
      { key: 'paperA', label: 'Paper colour', kind: 'color', default: [0.99, 0.8, 0.84], uniform: 'u_paperA' },
      { key: 'paperB', label: 'Pattern colour', kind: 'color', default: [1, 0.93, 0.62], uniform: 'u_paperB' },
    ],
  },
  'builtin:fx-crayon-doodles': {
    id: 'builtin:fx-crayon-doodles',
    name: 'Crayon doodles',
    desc: 'Wax-crayon stars, hearts, spirals, zigzags and scribbles scattered over the picture and wobbling like hand-drawn animation. The middle stays clearer for your subject.',
    frag: doodlesFrag,
    props: [
      { key: 'density', label: 'How many', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'size', label: 'Doodle size', default: 1, min: 0.5, max: 2.5, step: 0.05 },
      { key: 'clearCentre', label: 'Keep centre clear', default: 0.8, min: 0, max: 1, step: 0.01 },
      { key: 'stroke', label: 'Stroke width', default: 1, min: 0.5, max: 2.5, step: 0.05 },
    ],
  },
  'builtin:fx-cut-paper': {
    id: 'builtin:fx-cut-paper',
    name: 'Cut paper',
    desc: 'The frame rebuilt from irregular pieces of coloured paper with white cut edges and small shadows, re-cut at 8 fps like stop-motion collage.',
    frag: paperCutFrag,
    props: [
      { key: 'cells', label: 'Paper pieces', default: 7, min: 3, max: 30, step: 1 },
      { key: 'detail', label: 'Keep detail', default: 0.15, min: 0, max: 1, step: 0.01 },
      { key: 'edge', label: 'Cut edge', default: 0.07, min: 0.01, max: 0.2, step: 0.005 },
      { key: 'shadow', label: 'Shadow', default: 0.8, min: 0, max: 1.5, step: 0.05 },
    ],
  },
  'builtin:fx-pencil-sketch': {
    id: 'builtin:fx-pencil-sketch',
    name: 'Pencil sketch',
    desc: 'Graphite outlines and cross-hatched shading on cream paper; the lines shiver at 8 fps like a drawing in progress.',
    frag: pencilFrag,
    props: [
      { key: 'hatch', label: 'Shading', default: 1, min: 0, max: 1.5, step: 0.05 },
      { key: 'outline', label: 'Outline', default: 1.1, min: 0, max: 2, step: 0.05 },
      { key: 'paper', label: 'Cream paper', default: 0.8, min: 0, max: 1, step: 0.01 },
      { key: 'boil', label: 'Boil', default: 1, min: 0, max: 3, step: 0.05 },
    ],
  },
  'builtin:fx-watercolor': {
    id: 'builtin:fx-watercolor',
    name: 'Watercolor',
    desc: 'Soft pigment washes with darker pooled edges, bleeding colour and visible paper grain.',
    frag: watercolorFrag,
    props: [
      { key: 'smooth', label: 'Wash size', default: 3, min: 1, max: 8, step: 0.5 },
      { key: 'paper', label: 'Paper grain', default: 0.8, min: 0, max: 1.5, step: 0.05 },
      { key: 'edge', label: 'Pooled edges', default: 1.4, min: 0, max: 2, step: 0.05 },
      { key: 'bleed', label: 'Bleed', default: 1, min: 0, max: 3, step: 0.05 },
    ],
  },
  'builtin:fx-riso': {
    id: 'builtin:fx-riso',
    name: 'Risograph',
    desc: 'A two-ink zine print: halftone dots in two spot colours on off-white paper, slightly out of register, with speckle and grain.',
    frag: risoFrag,
    props: [
      { key: 'dots', label: 'Dot size', default: 9, min: 4, max: 24, step: 0.5 },
      { key: 'misprint', label: 'Misprint', default: 5, min: 0, max: 20, step: 0.5 },
      { key: 'grain', label: 'Speckle and grain', default: 1, min: 0, max: 2, step: 0.05 },
      { key: 'inkA', label: 'Ink 1', kind: 'color', default: [1, 0.3, 0.55], uniform: 'u_inkA' },
      { key: 'inkB', label: 'Ink 2', kind: 'color', default: [0.1, 0.35, 0.85], uniform: 'u_inkB' },
    ],
  },
  'builtin:fx-thermal': {
    id: 'builtin:fx-thermal',
    name: 'Thermal vision',
    desc: 'A heat-camera look: brightness becomes heat on a black, blue, purple, red, orange, yellow and white palette, with scanlines, sensor noise and targeting brackets.',
    frag: thermalFrag,
    props: [
      { key: 'contrast', label: 'Contrast', default: 1.5, min: 0.5, max: 3, step: 0.05 },
      { key: 'scan', label: 'Scanlines', default: 1, min: 0, max: 1.5, step: 0.05 },
      { key: 'hud', label: 'Targeting brackets', default: 1, min: 0, max: 1, step: 1 },
    ],
  },
  'builtin:fx-frame-division': {
    id: 'builtin:fx-frame-division',
    name: 'Frame division',
    desc: 'The frame is cut into irregular slabs and slivers, each showing its own crop and zoom of the picture, re-cut every fraction of a second.',
    frag: slabFrag,
    props: [
      { key: 'depth', label: 'Cuts', default: 4, min: 1, max: 5, step: 1 },
      { key: 'gap', label: 'Gap (px)', default: 6, min: 0, max: 24, step: 0.5 },
      { key: 'interval', label: 'Re-cut every (s)', default: 0.5, min: 0.1, max: 3, step: 0.05 },
      { key: 'zoom', label: 'Zoom variety', default: 0.8, min: 0, max: 2, step: 0.05 },
    ],
  },
};

export const MIXED_MEDIA_ORDER = [
  'builtin:fx-crayon',
  'builtin:fx-scrapbook-paper',
  'builtin:fx-crayon-doodles',
  'builtin:fx-cut-paper',
  'builtin:fx-pencil-sketch',
  'builtin:fx-watercolor',
  'builtin:fx-riso',
  'builtin:fx-thermal',
  'builtin:fx-frame-division',
] as const;
