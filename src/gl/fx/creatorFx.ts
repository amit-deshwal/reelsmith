// Reelsmith creator effects (RS-1207): the effects creators reach for in the paid phone editors that the library lacked.
// A label that follows the person, a beat bounce, a blackout strobe, sparkle glints and a sweeping lens flare.
import type { FxDef } from './uniforms';
import followTagFrag from './reel-follow-tag.frag.ts';
import bounceFrag from './reel-bounce.frag.ts';
import blackoutFrag from './reel-blackout.frag.ts';
import sparkleFrag from './reel-sparkle.frag.ts';
import flareSweepFrag from './reel-flare-sweep.frag.ts';

export const CREATOR_FX_EFFECTS: Record<string, FxDef> = {
  'builtin:fx-follow-tag': {
    id: 'builtin:fx-follow-tag',
    name: 'Follow tag',
    desc: 'A label (white text on a dark pill) rides above the person\'s head and follows them as they move, like body-tracked text. The text is the clip\'s title (set by the director). Needs the person cut-out.',
    needsMask: true,
    needsText: true,
    textKind: 'tag',
    frag: followTagFrag,
    props: [
      { key: 'size', label: 'Label height', default: 0.045, min: 0.02, max: 0.12, step: 0.005 },
      { key: 'gap', label: 'Space above the head', default: 0.025, min: 0, max: 0.15, step: 0.005 },
      { key: 'pop', label: 'Pop-in (seconds)', default: 0.35, min: 0.05, max: 1.5, step: 0.05 },
      { key: 'detect', label: 'Find people (0 one person, sharp / 1 groups and distance)', default: 0, min: 0, max: 1, step: 1 },
    ],
  },
  'builtin:fx-bounce': {
    id: 'builtin:fx-bounce',
    name: 'Bounce',
    desc: 'The picture punches in with a little stretch and settles. With beat timing it bounces on every beat.',
    frag: bounceFrag,
    props: [
      { key: 'amount', label: 'Punch', default: 0.08, min: 0, max: 0.3, step: 0.005 },
      { key: 'stretch', label: 'Vertical stretch', default: 0.5, min: 0, max: 1.5, step: 0.05 },
    ],
  },
  'builtin:fx-blackout': {
    id: 'builtin:fx-blackout',
    name: 'Blackout',
    desc: 'The picture drops to black (or a colour). With beat timing it strobes black on the beats.',
    frag: blackoutFrag,
    props: [
      { key: 'amount', label: 'Amount', default: 1, min: 0, max: 1, step: 0.01 },
      { key: 'color', label: 'Colour', kind: 'color', default: [0, 0, 0] },
    ],
  },
  'builtin:fx-sparkle': {
    id: 'builtin:fx-sparkle',
    name: 'Sparkle',
    desc: 'Four-point star glints grow out of the brightest points (sun on water, jewellery, city lights) and twinkle.',
    frag: sparkleFrag,
    props: [
      { key: 'threshold', label: 'Brightness to sparkle', default: 0.86, min: 0.5, max: 1, step: 0.01 },
      { key: 'length', label: 'Star size', default: 0.05, min: 0.01, max: 0.15, step: 0.005 },
      { key: 'intensity', label: 'Intensity', default: 1, min: 0, max: 3, step: 0.05 },
      { key: 'twinkle', label: 'Twinkle', default: 0.6, min: 0, max: 1, step: 0.05 },
    ],
  },
  'builtin:fx-flare-sweep': {
    id: 'builtin:fx-flare-sweep',
    name: 'Flare sweep',
    desc: 'A sun-like lens flare drifts across the top of the frame with a long streak and coloured ghosts, as if the camera panned past the sun.',
    frag: flareSweepFrag,
    props: [
      { key: 'speed', label: 'Speed (frame widths a second)', default: 0.35, min: 0.05, max: 2, step: 0.05 },
      { key: 'y', label: 'Height (0 top)', default: 0.18, min: 0, max: 0.8, step: 0.01 },
      { key: 'intensity', label: 'Intensity', default: 0.9, min: 0, max: 2, step: 0.05 },
      { key: 'warmth', label: 'Warmth', default: 0.7, min: 0, max: 1, step: 0.05 },
    ],
  },
};

export const CREATOR_FX_ORDER = ['builtin:fx-follow-tag', 'builtin:fx-bounce', 'builtin:fx-blackout', 'builtin:fx-sparkle', 'builtin:fx-flare-sweep'] as const;
