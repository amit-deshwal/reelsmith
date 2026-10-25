// Director mode moves (RS-1201): the effects the agent composes a reel from. Each move is one section of the reel: it
// says what it looks like, when it fits the story, what footage it needs and which settings it takes, and builds its
// items from clips the compiler casts. Moves are placed in fractions of the frame, so every move works in any ratio.
// Times inside a move scale with the section's length, so the agent sets the pace with beats.
import type { AtomicAction } from '../../editor/reducerActions';
import type { Keyframe } from '../../editor/types';
import { placeInSlot } from '../../editor/layouts';
import type { AssemblyClip } from '../assembler/types';
import { LAYOUT_SLOTS, withGutter } from '../assembler/collageGrid';
import { BAR_STEPS, isCloseUp, postcardOrder } from '../assembler/postcardCollage';
import { FINALE, FINALE_GRID_FROM_SEC, FINALE_NEEDS_SEC, FINALE_ROLES, finaleWindows, POSTCARD_GRAPHIC_CODE, stripWindows, type GraphicSource, type GraphicWindow } from '../postcardGraphics';
import { REVEAL_FRAG, REVEAL_LABELS, revealUniforms, type RevealKind } from '../travelDiaryReveal';
import { kenBurnsActions, type KenBurnsPreset } from '../kenBurns';
import { RECIPE_TRANSITIONS } from '../assembler/transitions';
import { focusForRange } from '../titleClear';
import type { PlanValue } from '../../../shared/reelsmith/directorPlan';
import { topBand } from './bandText';
import { CREATOR_MOVES } from './creatorMoves';
import { bool, clipAt, num, solid, str, type MoveContext, type MoveDef } from './moveKit';

export type { MoveContext, MoveDef, MoveParam } from './moveKit';
import { bigTitle, caption, titleShuffle, wordsOnBeat, type TextStyleDef } from './basicTextStyles';
import { CLIP_TEXT_STYLES, ENGINE_STYLES } from './textStyles';

// ---- item helpers ----------------------------------------------------------------------------------------------------

function source(ctx: MoveContext, clip: AssemblyClip, sec: number, fromSec: number): GraphicSource {
  const m = ctx.moment(clip, Math.round(sec * ctx.fps));
  const r = clip.kind === 'video' ? focusForRange(clip, m.inFrame, m.inFrame + Math.round(sec * ctx.fps)) : undefined;
  return {
    src: clip.src, kind: clip.kind, width: clip.width ?? ctx.W, height: clip.height ?? ctx.H, inSec: m.inFrame / ctx.fps, fromSec,
    ...(m.loop ? { loop: true } : {}), ...(r ? { focus: [r.x + r.w / 2, r.y + r.h / 2] as [number, number] } : {}),
  };
}

function graphic(ctx: MoveContext, layer: number, key: Array<string | number>, name: string, from: number, to: number, sources: Record<string, GraphicSource>, windows: GraphicWindow[], background?: string): void {
  ctx.emit({
    type: 'add', startFrame: from,
    item: {
      id: ctx.id(...key), track: ctx.layer(layer), kind: 'motion-graphic', name, code: POSTCARD_GRAPHIC_CODE,
      durationInFrames: Math.max(1, to - from), width: ctx.W, height: ctx.H, props: { sources, windows, ...(background ? { background } : {}) },
    } as never,
  });
}

/** Shots back to back on one lane, one clip each, cut at the given beats. Returns their item ids. */
function shots(ctx: MoveContext, layer: number, cutsBeats: number[], tag: string, extra: (i: number) => Record<string, unknown> = () => ({})): string[] {
  const frames = [...cutsBeats.map((b) => ctx.beatFrame(b)), ctx.end];
  return cutsBeats.map((_, i) => {
    const clip = ctx.clips[i % ctx.clips.length]!;
    const a = Math.max(ctx.start, frames[i]!);
    const b = Math.min(ctx.end, frames[i + 1]!);
    return b > a ? clipAt(ctx, layer, [tag, i], clip, a, b, ctx.moment(clip, b - a).inFrame, extra(i)) : '';
  }).filter(Boolean);
}

const steps = (len: number, every: number) => Array.from({ length: Math.max(1, Math.ceil(len / every - 1e-6)) }, (_, i) => i * every);

// ---- the moves ---------------------------------------------------------------------------------------------------------

const cut: MoveDef = {
  id: 'cut', name: 'Beat cuts', looks: 'Full-frame shots, one after another, each cut landing on the beat.',
  use: 'The backbone: travelling, the build-up, any stretch where the footage should speak. 2 beats a shot is lively, 4 is calm, 1 is energetic.',
  clips: { min: 1, max: 32 }, beats: { min: 1, default: 8, max: 64 },
  params: [
    { id: 'every', type: 'number', label: 'Beats per shot', default: 2, min: 0.5, max: 8 },
    { id: 'transition', type: 'enum', label: 'Between shots', default: 'none', options: ['none', ...Object.keys(RECIPE_TRANSITIONS)] },
  ],
  clipCount: (beats, p) => Math.ceil(beats / num(p.every, 2) - 1e-6),
  build: (ctx) => {
    const ids = shots(ctx, 0, steps(ctx.beats, num(ctx.params.every, 2)), 'cut');
    const spec = RECIPE_TRANSITIONS[str(ctx.params.transition, 'none')];
    if (!spec) return;
    const shot = Math.max(2, ctx.beatFrame(num(ctx.params.every, 2)) - ctx.start);
    const length = Math.max(2, Math.min(Math.round(spec.seconds * ctx.fps), Math.floor(shot / 2)));
    ids.slice(1).forEach((itemId, i) => ctx.emit({ type: 'addTransition', id: ctx.id('cut-tr', i), incomingItemId: itemId, transType: spec.type, durationInFrames: length } as AtomicAction));
  },
};

const flashCuts: MoveDef = {
  id: 'flash-cuts', name: 'Flash cuts', looks: 'Very fast cuts (half a beat each) with a white flash on every cut.',
  use: 'A burst of energy: the drop of the song, a hype intro, the last seconds before the ending. Keep it short (2-4 beats).',
  clips: { min: 2, max: 16 }, beats: { min: 1, default: 2, max: 8 },
  params: [
    { id: 'every', type: 'number', label: 'Beats per shot', default: 0.5, min: 0.25, max: 2 },
    { id: 'flash', type: 'boolean', label: 'White flash on each cut', default: true },
  ],
  clipCount: (beats, p) => Math.ceil(beats / num(p.every, 0.5) - 1e-6),
  build: (ctx) => {
    const cuts = steps(ctx.beats, num(ctx.params.every, 0.5));
    shots(ctx, 0, cuts, 'flash');
    if (!bool(ctx.params.flash, true)) return;
    const len = Math.max(2, Math.round(ctx.fps * 0.12));
    cuts.forEach((b, i) => {
      const f = ctx.beatFrame(b);
      if (f + 1 < ctx.end) solid(ctx, 1, ['flash-w', i], 'Flash', f, Math.min(ctx.end, f + len), '#ffffff', { transform: { opacity: 0.85 }, fadeOutFrames: len });
    });
  },
};

const hold: MoveDef = {
  id: 'hold', name: 'Hero shot', looks: 'One shot held full frame with a slow push in.',
  use: 'A moment to breathe: the view from the top, the reveal of the place, the last shot under a closing line.',
  clips: { min: 1, max: 1 }, beats: { min: 2, default: 8, max: 32 }, wants: ['scenery', 'water', 'city'],
  params: [{ id: 'push', type: 'number', label: 'Push in (0 = still)', default: 0.08, min: 0, max: 0.3 }],
  build: (ctx) => {
    const clip = ctx.clips[0]!;
    const push = num(ctx.params.push, 0.08);
    const len = ctx.end - ctx.start;
    clipAt(ctx, 0, ['hold'], clip, ctx.start, ctx.end, ctx.moment(clip, len).inFrame,
      push > 0 ? { keyframes: { scale: [{ frame: 0, value: 1, easing: 'easeOut' }, { frame: len - 1, value: 1 + push }] } } : {});
  },
};

const KB: KenBurnsPreset[] = ['push-in', 'pan-right', 'pull-out', 'pan-left', 'drift-up', 'drift-down'];
const photoDrift: MoveDef = {
  id: 'photo-drift', name: 'Moving photos', looks: 'Photos one after another, each with its own slow push, pull or pan (Ken Burns).',
  use: 'Photos, memories, a calm stretch of the story. Works for video too, but it is made for stills.',
  clips: { min: 1, max: 24 }, beats: { min: 2, default: 16, max: 64 },
  params: [{ id: 'every', type: 'number', label: 'Beats per photo', default: 4, min: 1, max: 16 }],
  clipCount: (beats, p) => Math.ceil(beats / num(p.every, 4) - 1e-6),
  build: (ctx) => {
    const ids = shots(ctx, 0, steps(ctx.beats, num(ctx.params.every, 4)), 'drift');
    ids.forEach((id, i) => {
      const clip = ctx.clips[i % ctx.clips.length]!;
      const dur = Math.max(1, ctx.end - ctx.start); // only the curve's shape matters; the editor keys it on the item
      for (const a of kenBurnsActions({ id, durationInFrames: dur }, KB[(i + ctx.seed) % KB.length]!, { src: clip, canvas: { width: ctx.W, height: ctx.H } })) ctx.emit(a);
    });
  },
};

const LAYOUTS = Object.keys(LAYOUT_SLOTS);
const split: MoveDef = {
  id: 'split', name: 'Split screen', looks: 'The frame splits into stacked rows, side-by-side halves or a grid; the tiles fill one by one on the beat.',
  use: 'Showing many moments at once: the group, the food, the details, "everything we did". Rows suit 9:16, halves suit 16:9.',
  clips: { min: 2, max: 9 }, beats: { min: 2, default: 4, max: 16 }, wants: ['people', 'food', 'detail'],
  params: [
    { id: 'layout', type: 'enum', label: 'Layout', default: 'auto', options: ['auto', ...LAYOUTS] },
    { id: 'stagger', type: 'number', label: 'Beats between tiles', default: 0.5, min: 0, max: 4 },
    { id: 'gutter', type: 'number', label: 'Gap (px)', default: 12, min: 0, max: 60 },
    { id: 'background', type: 'color', label: 'Background', default: '#000000' },
  ],
  clipCount: (_b, p, W, H) => LAYOUT_SLOTS[layoutFor(p, 3, W, H)]!.length,
  build: (ctx) => {
    const layout = layoutFor(ctx.params, ctx.clips.length, ctx.W, ctx.H);
    const slots = LAYOUT_SLOTS[layout]!;
    solid(ctx, 0, ['split-bg'], 'Background', ctx.start, ctx.end, str(ctx.params.background, '#000000'));
    const stagger = num(ctx.params.stagger, 0.5);
    slots.forEach((slot, i) => {
      const clip = ctx.clips[i % ctx.clips.length]!;
      const from = Math.min(ctx.end - 1, ctx.beatFrame(i * stagger));
      const transform = placeInSlot(withGutter(slot, num(ctx.params.gutter, 12), { width: ctx.W, height: ctx.H }), 'cover');
      clipAt(ctx, 1 + i, ['tile', i], clip, from, ctx.end, ctx.moment(clip, ctx.end - from).inFrame, { transform });
    });
  },
};
function layoutFor(p: Record<string, PlanValue>, clips: number, W: number, H: number): string {
  const want = str(p.layout, 'auto');
  if (LAYOUT_SLOTS[want]) return want;
  const tall = H > W;
  if (clips >= 9) return 'grid3x3';
  if (clips >= 4) return 'grid2x2';
  if (clips === 3) return tall ? 'split3v' : 'split2h';
  return tall ? 'split2v' : 'split2h';
}

const REVEALS: RevealKind[] = ['tall', 'wide', 'window'];
const breakIn: MoveDef = {
  id: 'break-in', name: 'Break-in shots', looks: 'Each next shot breaks in over the one before: five bars (tall or wide) land one by one with a white flash, or a window grows in steps.',
  use: 'Contrast and surprise: before and after, calm then wild, close then wide. Needs the song: the bars land on half-beats.',
  clips: { min: 2, max: 8 }, beats: { min: 6, default: 16, max: 48 },
  params: [
    { id: 'every', type: 'number', label: 'Beats per shot', default: 4, min: 3, max: 16 },
    { id: 'kind', type: 'enum', label: 'Reveal', default: 'mix', options: ['mix', ...REVEALS] },
  ],
  clipCount: (beats, p) => Math.ceil(beats / num(p.every, 4) - 1e-6),
  build: (ctx) => {
    const every = num(ctx.params.every, 4);
    const cuts = steps(ctx.beats, every);
    const lead = Math.min(2.75, every * 0.7);
    const kindOf = (i: number): RevealKind => { const k = str(ctx.params.kind, 'mix'); return (REVEALS as string[]).includes(k) ? k as RevealKind : REVEALS[(i - 1) % 3]!; };
    const reveal = cuts.map((b, i) => {
      if (i === 0) return null;
      const L = ctx.beatFrame(b) - ctx.beatFrame(b - lead);
      const lands = (kindOf(i) === 'window' ? [0.75, 1.25, 1.75, 2.25] : [0.25, 0.75, 1.25, 1.75, 2.25]).map((o) => o * (lead / 2.75))
        .map((o) => (ctx.beatFrame(b - lead + o) - ctx.beatFrame(b - lead)) / ctx.fps);
      return { L, lands };
    });
    // a reveal of L frames is centred on the item boundary
    const edge = (i: number) => (i === 0 ? ctx.start : ctx.beatFrame(cuts[i]!) - (reveal[i]!.L - Math.floor(reveal[i]!.L / 2)));
    const ids = cuts.map((b, i) => {
      const clip = ctx.clips[i % ctx.clips.length]!;
      const a = edge(i);
      const z = i + 1 < cuts.length ? edge(i + 1) : ctx.end;
      const visible = i === 0 ? a : ctx.beatFrame(b) - reveal[i]!.L;
      const m = ctx.moment(clip, (z - visible) + 2);
      return clipAt(ctx, 0, ['break', i], clip, a, z, m.inFrame + (a - visible));
    });
    reveal.forEach((r, i) => {
      if (!r) return;
      ctx.emit({ type: 'addTransition', id: ctx.id('break-tr', i), incomingItemId: ids[i]!, transType: 'custom-shader', durationInFrames: r.L,
        custom: { frag: REVEAL_FRAG, uniforms: revealUniforms(kindOf(i), r.lands, r.L / ctx.fps), label: REVEAL_LABELS[kindOf(i)] } } as never);
    });
  },
};

const STRIP_AT = [0.18, 0.35, 0.52, 0.68, 0.85, 1.05];
const stripsReveal: MoveDef = {
  id: 'strips-reveal', name: 'Strips behind you', looks: 'A wide shot of a person; tall strips of other clips pop in left to right behind them, the person flashes white and vanishes, then black bars close the picture.',
  use: 'The opener of a trip: "this is me, and this is everything I saw". Needs a steady wide shot with one or two people standing or walking, head and most of the body in frame, as the first clip; then one clip per strip (tall subjects: people, towers, trees, doorways).',
  clips: { min: 3, max: 7 }, beats: { min: 4, default: 8, max: 16 }, wants: ['people', 'posing', 'city', 'portrait'],
  params: [
    { id: 'strips', type: 'number', label: 'Strips (0 = 6 wide, 4 tall)', default: 0, min: 0, max: 6 },
    { id: 'person', type: 'boolean', label: 'Person in front, flashing white', default: true },
    { id: 'bars', type: 'boolean', label: 'Black bars close at the end', default: true },
  ],
  clipCount: (_b, p, W, H) => 1 + stripCount(p, W, H),
  build: (ctx) => {
    const k = (ctx.end - ctx.start) / ctx.fps / 3.6;
    const at = (s: number) => ctx.start + Math.round(s * k * ctx.fps);
    const n = Math.min(stripCount(ctx.params, ctx.W, ctx.H), Math.max(1, ctx.clips.length - 1));
    const base = ctx.clips[0]!;
    const len = ctx.end - ctx.start;
    const m = ctx.moment(base, len);
    clipAt(ctx, 0, ['strips-base'], base, ctx.start, ctx.end, m.inFrame);
    const times = STRIP_AT.slice(0, n).map((s) => s * k);
    const sources = Object.fromEntries(Array.from({ length: n }, (_, i) => [`strip${i + 1}`, source(ctx, ctx.clips[1 + i]!, len / ctx.fps - times[i]!, times[i]!)]));
    graphic(ctx, 1, ['strips'], `${n} strips`, ctx.start, ctx.end, sources, stripWindows(ctx.W, ctx.H, times, len / ctx.fps));
    const focus = base.kind === 'video' ? focusForRange(base, m.inFrame, m.inFrame + len) : undefined;
    if (bool(ctx.params.person, true) && base.kind === 'video') {
      if (focus && isCloseUp(focus)) ctx.warn(`${base.name} is a close-up, so nobody is cut out in front of the strips; open with a wide shot of a person for that.`);
      else {
        const cut = at(1.433);
        const person = (key: string, from: number, to: number, white: number) => clipAt(ctx, 2, [key], base, from, to, m.inFrame + (from - ctx.start), {
          name: white ? 'Person flashes white' : 'Person in front', effects: [{ id: ctx.id(key, 'fx'), assetId: 'builtin:fx-person-cutout', overrides: { white } }],
        });
        person('person', ctx.start, cut, 0);
        person('person-flash', cut, at(1.517), 1);
      }
    }
    if (bool(ctx.params.bars, true)) {
      const from = at(BAR_STEPS[0]![0]);
      const keys = (sign: 1 | -1): Keyframe[] => BAR_STEPS.map(([s, c]) => ({ frame: at(s) - from, value: sign * (100 - 100 * c) }));
      solid(ctx, 3, ['bar-top'], 'Bar (top)', from, ctx.end, '#000000', { keyframes: { y: keys(-1) }, transform: { y: -100 } });
      solid(ctx, 4, ['bar-bottom'], 'Bar (bottom)', from, ctx.end, '#000000', { keyframes: { y: keys(1) }, transform: { y: 100 } });
    }
  },
};
function stripCount(p: Record<string, PlanValue>, W: number, H: number): number {
  const n = Math.round(num(p.strips, 0));
  return n >= 1 ? Math.min(6, n) : W > H ? 6 : 4;
}

const postcardBand: MoveDef = {
  id: 'postcard-band', name: 'Postcard flicker', looks: 'Very fast cuts (3-6 frames) through many clips, seen through a black band that opens slowly from a slit to almost the full frame.',
  use: 'A montage of everything, under a title overlay. Best right after the opener, 12-16 beats; it hands over well to cards-finale.',
  clips: { min: 3, max: 40 }, beats: { min: 4, default: 14, max: 32 },
  params: [
    { id: 'from', type: 'number', label: 'Band at the start (0 slit .. 1 full)', default: 0.01, min: 0, max: 1 },
    { id: 'to', type: 'number', label: 'Band at the end', default: 0.95, min: 0, max: 1 },
  ],
  clipCount: () => 12,
  leaves: (ctx) => ({ bandCover: Math.max(0, 0.5 * (1 - num(ctx.params.to, 0.95))) }),
  build: (ctx) => {
    const pattern = [6, 3, 3, 3].map((n) => Math.max(1, Math.round((n * ctx.fps) / 30)));
    const cuts: Array<[number, number]> = [];
    for (let f = ctx.start, i = 0; f < ctx.end; i += 1) { const len = pattern[i % 4]!; cuts.push([f, Math.min(ctx.end, f + len)]); f += len; }
    const order = postcardOrder(ctx.clips, cuts.length);
    const visits = new Map<string, number>();
    order.forEach((clip, i) => {
      const [a, b] = cuts[i]!;
      const v = visits.get(clip.assetId) ?? 0;
      visits.set(clip.assetId, v + 1);
      const room = Math.max(1, clip.durationInFrames - (b - a));
      clipAt(ctx, 0, ['card', i], clip, a, b, clip.kind === 'video' ? ((clip.bestStartFrame ?? 0) + v * Math.round(0.4 * ctx.fps)) % room : 0);
    });
    const c0 = 0.5 * (1 - num(ctx.params.from, 0.01));
    const c1 = 0.5 * (1 - num(ctx.params.to, 0.95));
    const last = ctx.end - ctx.start - 1;
    const keys = (sign: 1 | -1): Keyframe[] => [{ frame: 0, value: sign * (100 - 100 * c0) }, { frame: last, value: sign * (100 - 100 * c1) }];
    solid(ctx, 1, ['band-top'], 'Band (top)', ctx.start, ctx.end, '#000000', { keyframes: { y: keys(-1) }, transform: { y: -100 } });
    solid(ctx, 2, ['band-bottom'], 'Band (bottom)', ctx.start, ctx.end, '#000000', { keyframes: { y: keys(1) }, transform: { y: 100 } });
  },
};

const cardsFinale: MoveDef = {
  id: 'cards-finale', name: 'Cards, grid and panorama', looks: 'A wide shot fills the frame, two more wipe in as bands over its top and bottom thirds, the bands become three cards, the cards split into a six-window grid that swaps pictures, then one window grows into a panorama that shuts into a thin line.',
  use: 'The ending of a trip film. Clips in order: middle (a wide shot with movement: people walking, a pan), top band (wide, moving), closer (the most beautiful wide shot with movement in it: a pan, a drone, people walking; it is on screen about 6 s and ends the film, so a locked-off or tiny-planet shot reads as frozen), then three details for the grid. The first 2-3 s show only the middle and the two bands, so avoid still footage (people sitting, talking, a held selfie) in those three roles. The grid tiles are small: give them steady, sharp moments with one clear subject (a face, a pose, a view, an object), never a walking, running or jumping shot (its motion blur shows at that size) or a crowd.',
  clips: { min: 3, max: 6 }, beats: { min: 10, default: 12, max: 24 }, wants: ['scenery', 'water', 'city', 'food', 'detail', 'people'],
  params: [],
  clipCount: () => 6,
  build: (ctx) => {
    const clock = finaleClock((ctx.end - ctx.start) / ctx.fps);
    const cover = ctx.previous?.bandCover ?? 0;
    const windows = finaleWindows(ctx.W, ctx.H, 0, () => cover, 'subject').map((w) => ({ ...w, from: clock(w.from), to: clock(w.to), keys: w.keys.map((key) => ({ ...key, t: clock(key.t) })) }));
    const sources = Object.fromEntries(FINALE_ROLES.map((role, i) => {
      const from = role.startsWith('grid') ? FINALE_GRID_FROM_SEC : 0;
      return [role, source(ctx, ctx.clips[i % ctx.clips.length]!, clock(from + FINALE_NEEDS_SEC[role]) - clock(from), clock(from))];
    }));
    graphic(ctx, 0, ['finale'], 'Bands, cards, grid and panorama', ctx.start, ctx.end, sources, windows, '#000000');
  },
};

/**
 * The shared choreography's seconds → the director's finale seconds. Played as is it dragged (every wipe and card move
 * 0.6-0.8 s, still bands idling a second before the cards, the full grid idling before the panorama), so the moves run
 * at 75% and the idles mostly go. It ends a moment after the panorama shuts (the shared black tail read as a frozen
 * ending). A shorter section squeezes all of it; a longer one holds the moving panorama longer instead of slowing the moves.
 */
const FINALE_PACE: ReadonlyArray<readonly [until: number, rate: number]> = [
  [FINALE.closerWipe[1], 0.75], [FINALE.cards[0], 0.3], [FINALE.swaps.bottom2 + FINALE.gridLength, 0.75],
  [FINALE.pano[0], 0.4], [FINALE.pano[1], 0.75], [FINALE.shut[0], 1], [FINALE.shut[1] + 0.2, 0.75],
];
const FINALE_HOLD = 5;
export const FINALE_NATURAL_SEC = FINALE_PACE.reduce((s, [until, rate], i) => s + (until - (FINALE_PACE[i - 1]?.[0] ?? 0)) * rate, 0);

export function finaleClock(sec: number): (t: number) => number {
  const k = Math.min(1, sec / FINALE_NATURAL_SEC);
  const extra = Math.max(0, sec - FINALE_NATURAL_SEC);
  return (t) => {
    let out = 0;
    let prev = 0;
    for (const [i, [until, rate]] of FINALE_PACE.entries()) {
      const seg = (until - prev) * rate + (i === FINALE_HOLD ? extra : 0);
      if (t <= until || i === FINALE_PACE.length - 1) {
        const part = t <= until ? ((t - prev) / (until - prev)) * seg : seg + (t - until) * rate;
        return k * (out + part);
      }
      out += seg;
      prev = until;
    }
    return k * out;
  };
}

const black: MoveDef = {
  id: 'black', name: 'Black pause', looks: 'A plain colour (black by default) with nothing on it.',
  use: 'A beat of silence for a title card or a line of the story to land on its own.',
  clips: { min: 0, max: 0 }, beats: { min: 1, default: 4, max: 16 },
  params: [{ id: 'color', type: 'color', label: 'Colour', default: '#000000' }],
  build: (ctx) => { solid(ctx, 0, ['black'], 'Pause', ctx.start, ctx.end, str(ctx.params.color, '#000000')); },
};

const zoomPunch: MoveDef = {
  id: 'zoom-punch', name: 'Punch-in cuts', looks: 'Beat cuts where every new shot punches in (starts zoomed and snaps back), like a hit on the drum.',
  use: 'Energetic stretches with a strong beat: the build-up, sport, dance, city at night. Stronger than plain cuts; do not run it long.',
  clips: { min: 2, max: 24 }, beats: { min: 2, default: 8, max: 32 },
  params: [
    { id: 'every', type: 'number', label: 'Beats per shot', default: 1, min: 0.5, max: 4 },
    { id: 'punch', type: 'number', label: 'Punch size', default: 0.18, min: 0.05, max: 0.5 },
  ],
  clipCount: (beats, p) => Math.ceil(beats / num(p.every, 1) - 1e-6),
  build: (ctx) => {
    const punch = num(ctx.params.punch, 0.18);
    const settle = Math.max(3, Math.round(ctx.fps * 0.22));
    shots(ctx, 0, steps(ctx.beats, num(ctx.params.every, 1)), 'punch', () => ({ keyframes: { scale: [{ frame: 0, value: 1 + punch, easing: 'easeOut' }, { frame: settle, value: 1 }] } }));
  },
};

const speedRamp: MoveDef = {
  id: 'speed-ramp', name: 'Speed ramp', looks: 'One shot plays at normal speed, drops into slow motion for the key moment, then whips forward fast.',
  use: 'The single most dramatic action shot: a jump, a splash, a turn, a reveal. Needs a video at least 4 s long; one clip.',
  clips: { min: 1, max: 1 }, beats: { min: 4, default: 8, max: 16 }, wants: ['action', 'people'],
  params: [{ id: 'slow', type: 'number', label: 'Slow-motion speed', default: 0.35, min: 0.15, max: 0.8 }],
  build: (ctx) => {
    const clip = ctx.clips[0]!;
    const len = ctx.end - ctx.start;
    const slow = num(ctx.params.slow, 0.35);
    // three parts: 30% at 1x, 45% slow, 25% at 2.5x; the source keeps running forward without a jump
    const parts: Array<[number, number]> = [[0.3, 1], [0.45, slow], [0.25, 2.5]];
    const sourceNeed = Math.round(parts.reduce((s, [share, rate]) => s + share * len * rate, 0));
    if (clip.kind !== 'video') { clipAt(ctx, 0, ['ramp'], clip, ctx.start, ctx.end, 0); return; }
    let src = ctx.moment(clip, sourceNeed).inFrame;
    let at = ctx.start;
    parts.forEach(([share, rate], i) => {
      const to = i === parts.length - 1 ? ctx.end : at + Math.round(share * len);
      clipAt(ctx, 0, ['ramp', i], clip, at, to, Math.min(src, Math.max(0, clip.durationInFrames - 2)), rate === 1 ? {} : { playbackRate: rate });
      src += Math.round((to - at) * rate);
      at = to;
    });
  },
};

const photoStack: MoveDef = {
  id: 'photo-stack', name: 'Photo stack', looks: 'Photos (or clips) drop in one by one as tilted white-bordered prints that pile up on a coloured background.',
  use: 'Memories, a photo dump, "best of the trip", group photos, food. 3-6 photos; works for stills best.',
  clips: { min: 2, max: 8 }, beats: { min: 4, default: 8, max: 24 }, wants: ['people', 'food', 'detail'],
  params: [
    { id: 'every', type: 'number', label: 'Beats between prints', default: 1, min: 0.5, max: 4 },
    { id: 'background', type: 'color', label: 'Background', default: '#1b1b1b' },
  ],
  clipCount: (beats, p) => Math.min(8, Math.max(2, Math.floor(beats / num(p.every, 1)))),
  build: (ctx) => {
    solid(ctx, 0, ['stack-bg'], 'Background', ctx.start, ctx.end, str(ctx.params.background, '#1b1b1b'));
    const every = num(ctx.params.every, 1);
    const n = Math.min(ctx.clips.length, 7);
    const drop = Math.max(4, Math.round(ctx.fps * 0.3));
    for (let i = 0; i < n; i += 1) {
      const clip = ctx.clips[i]!;
      const from = Math.min(ctx.end - 2, ctx.beatFrame(i * every));
      const rot = ((((ctx.seed + 1) * 9301 + i * 49297) % 233280) / 233280 - 0.5) * 16;
      const dx = ((((ctx.seed + 7) * 7919 + i * 104729) % 1000) / 1000 - 0.5) * 14;
      const dy = ((((ctx.seed + 3) * 6007 + i * 15485863) % 1000) / 1000 - 0.5) * 10;
      const keys = (s: number): Record<string, Keyframe[]> => ({ y: [{ frame: 0, value: dy - 70, easing: 'easeOut' }, { frame: drop, value: dy }], opacity: [{ frame: 0, value: 0 }, { frame: Math.round(drop / 2), value: 1 }], scale: [{ frame: 0, value: s * 1.15, easing: 'easeOut' }, { frame: drop, value: s }] });
      // a white print behind the picture: the same transform, a little bigger
      solid(ctx, 1 + i * 2, ['print', i], 'Print', from, ctx.end, '#f7f4ee', { transform: { x: dx, y: dy, scale: 0.7, rotation: rot }, keyframes: keys(0.7) });
      clipAt(ctx, 2 + i * 2, ['stack', i], clip, from, ctx.end, ctx.moment(clip, ctx.end - from).inFrame, { transform: { x: dx, y: dy, scale: 0.64, rotation: rot }, keyframes: keys(0.64) });
    }
  },
};

const compare: MoveDef = {
  id: 'compare', name: 'Before / after', looks: 'Two shots of the same frame: the second wipes across the first from the right, stops at the middle, then takes the whole frame.',
  use: 'Contrast: before and after, day and night, the start of the climb and the top, "expectation vs reality". Two clips, ideally similar framing.',
  clips: { min: 2, max: 2 }, beats: { min: 4, default: 8, max: 16 },
  params: [],
  build: (ctx) => {
    const sec = (ctx.end - ctx.start) / ctx.fps;
    const full: [number, number, number, number] = [0, 0, ctx.W, ctx.H];
    const sources = { a: source(ctx, ctx.clips[0]!, sec, 0), b: source(ctx, ctx.clips[1]!, sec, 0) };
    const half = ctx.W / 2;
    const line = Math.max(3, Math.round(ctx.W * 0.004));
    graphic(ctx, 0, ['compare'], 'Before / after', ctx.start, ctx.end, sources, [
      { s: 'a', from: 0, to: sec, cover: 'frame', keys: [{ t: 0, win: full }] },
      { s: 'b', from: sec * 0.15, to: sec, cover: 'frame', keys: [
        { t: sec * 0.15, win: [ctx.W, 0, 0, ctx.H], anchor: full }, { t: sec * 0.4, win: [half, 0, half, ctx.H], anchor: full },
        { t: sec * 0.7, win: [half, 0, half, ctx.H], anchor: full }, { t: sec * 0.9, win: full, anchor: full },
      ] },
      { s: null, fill: '#ffffff', from: sec * 0.15, to: sec * 0.9, cover: 'frame', keys: [
        { t: sec * 0.15, win: [ctx.W - line, 0, line, ctx.H] }, { t: sec * 0.4, win: [half - line / 2, 0, line, ctx.H] },
        { t: sec * 0.7, win: [half - line / 2, 0, line, ctx.H] }, { t: sec * 0.9, win: [-line, 0, line, ctx.H] },
      ] },
    ], '#000000');
  },
};

export const MOVES: readonly MoveDef[] = [cut, flashCuts, zoomPunch, hold, speedRamp, ...CREATOR_MOVES, photoDrift, photoStack, split, breakIn, compare, stripsReveal, postcardBand, cardsFinale, black];
export const moveById = (id: string) => MOVES.find((m) => m.id === id);
export const ALL_STRIP_TIMES = STRIP_AT;

// ---- text styles ---------------------------------------------------------------------------------------------------------

export type { TextContext, TextStyleDef } from './basicTextStyles';

export const TEXT_STYLES: readonly TextStyleDef[] = [titleShuffle, wordsOnBeat, bigTitle, caption, topBand, ...ENGINE_STYLES, ...CLIP_TEXT_STYLES];
export const textStyleById = (id: string) => TEXT_STYLES.find((t) => t.id === id);
