// World swap (RS-1263): one person keeps moving, cut out of one continuous shot, while the place behind them changes on
// every beat ("me in every city" without matching shots). The person is the RS-1206 front copy: a lane above the places,
// marked rsFront, so the cut-out goes on last, after shot matching and the look, like the 3D zoom's front layer.
import type { AssemblyClip } from '../assembler/types';
import { fillTransformForFocus } from '../cropFocus';
import { focusForRange } from '../titleClear';
import { bool, clipAt, num, type MoveContext, type MoveDef } from './moveKit';

/** Where each place starts and ends, in beats from the section start: one every `every` beats, the last one to the end. */
export function swapBeats(beats: number, every: number): Array<[number, number]> {
  const step = Math.max(0.5, every);
  const out: Array<[number, number]> = [];
  for (let b = 0; b < beats - 1e-9; b += step) out.push([b, Math.min(beats, b + step)]);
  const last = out.at(-1);
  // a sliver of under half a step at the end joins the place before it
  if (out.length > 1 && last && last[1] - last[0] < step / 2) { out.pop(); out.at(-1)![1] = beats; }
  return out;
}

/** The places in order: the person's own shot first when `own`, then the other clips in turn (repeating when there are fewer). */
export function swapPlaces<T>(person: T, others: readonly T[], count: number, own: boolean): T[] {
  return Array.from({ length: count }, (_, i) => {
    if (own && i === 0) return person;
    const k = own ? i - 1 : i;
    return others.length ? others[k % others.length]! : person;
  });
}

export const worldSwap: MoveDef = {
  id: 'world-swap', name: 'World swap',
  looks: 'One person keeps walking (or dancing) without a break, cut out of their shot, while the place behind them changes on every beat.',
  use: '"Me in every city", a trip in one walk, an outfit-free travel montage. The first clip is one continuous video of one clear person, full body or waist up; the others are the places (wide shots or photos with no one in front). Once per reel.',
  clips: { min: 2, max: 9 }, beats: { min: 2, default: 8, max: 16 }, wants: ['people', 'action', 'dancing'],
  params: [
    { id: 'every', type: 'number', label: 'Beats per place', default: 1, min: 0.5, max: 4 },
    { id: 'own', type: 'boolean', label: 'Start in the person\'s own place', default: true },
  ],
  clipCount: (beats, p) => {
    const places = swapBeats(beats, num(p.every, 1)).length - (bool(p.own, true) ? 1 : 0);
    return Math.min(9, 1 + Math.max(1, places));
  },
  build: (ctx: MoveContext) => {
    const person = ctx.clips[0]!;
    const others = ctx.clips.slice(1);
    const len = ctx.end - ctx.start;
    const m = ctx.moment(person, len);
    if (!others.length) {
      ctx.warn(`A world swap needs places to swap in; only ${person.name} was given, so it plays as one shot.`);
      clipAt(ctx, 0, ['ws-only'], person, ctx.start, ctx.end, m.inFrame);
      return;
    }
    if (person.kind !== 'video') ctx.warn(`${person.name} is a photo, so the person stands still while the places change; a video of them walking keeps them moving.`);
    else if (m.loop) ctx.warn(`${person.name} is shorter than this world swap, so the person jumps back once; give it a longer walk or fewer beats.`);
    const spans = swapBeats(ctx.beats, num(ctx.params.every, 1));
    const own = bool(ctx.params.own, true);
    const places = swapPlaces<AssemblyClip>(person, others, spans.length, own);
    // The cut-out and the person's own place share one framing, from where the person is over the whole section: crop
    // focus would otherwise frame each by its own range, and the cut-out would sit off its own picture.
    const fill = fillTransformForFocus(person.width ?? 0, person.height ?? 0, ctx.W, ctx.H, person.kind === 'video' ? focusForRange(person, m.inFrame, m.inFrame + len) : undefined);
    const framing = fill ? { transform: { scale: fill.scale, scaleX: fill.scale, scaleY: fill.scale, x: fill.x, y: fill.y } } : {};
    spans.forEach(([b0, b1], i) => {
      const from = i === 0 ? ctx.start : ctx.beatFrame(b0);
      const to = i === spans.length - 1 ? ctx.end : ctx.beatFrame(b1);
      if (to - from < 1) return;
      const place = places[i]!;
      // the person's own place plays the same moment as the cut-out above it, so the first swap is the only change
      const inFrame = place === person ? m.inFrame + (from - ctx.start) : ctx.moment(place, to - from).inFrame;
      clipAt(ctx, 0, ['ws-place', i], place, from, to, inFrame, place === person ? framing : {});
    });
    // one item for the whole section: the person never jumps
    clipAt(ctx, 1, ['ws-person'], person, ctx.start, ctx.end, m.inFrame, {
      name: `${person.name} (cut out)`, volume: ctx.clipVolume ?? 0, ...framing, props: { rsFront: true },
    });
  },
};
