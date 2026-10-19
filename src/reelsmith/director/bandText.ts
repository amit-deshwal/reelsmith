// A title band: a black strip across the top with the line centred in it, and the footage scaled down underneath so
// nothing is covered. Used as an overlay across the sections it should stay on.
import type { TextStyleDef } from './moves';

/** Share of the frame height the band takes, for wide and for tall frames. */
const BAND = { wide: 0.2, tall: 0.18 };
const bandShare = (H: number, W: number) => (H > W ? BAND.tall : BAND.wide);

export const BAND_STYLE_ID = 'top-band';

export const topBand: TextStyleDef = {
  id: BAND_STYLE_ID, name: 'Title band on top', maxChars: 70,
  looks: 'A black strip across the top with the line centred in it in bold white, shown for the whole span; the footage is scaled down underneath so the line never covers the picture.',
  use: 'A joke or title that must stay on screen for the whole reel without covering the shot (the user asks for text "above the video" or "in the black space"). Use it as ONE overlay from the first section to the last. Moves that fill the frame with graphics (strips-reveal, cards-finale, postcard-band) will cover the band; use cut, hold, zoom-punch or flash-cuts under it.',
  params: [],
  build: (ctx) => {
    const share = bandShare(ctx.H, ctx.W);
    const longest = Math.max(1, ...ctx.text.split('\n').map((l) => [...l].length));
    const fontSize = Math.round(Math.max(24, Math.min(ctx.H * share * 0.42, (ctx.W * 0.9) / (longest * 0.6))));
    ctx.emit({
      type: 'add', startFrame: ctx.start,
      item: {
        id: ctx.id('band-text'), track: ctx.lane(0), kind: 'text', name: ctx.text.slice(0, 24), durationInFrames: Math.max(1, ctx.end - ctx.start), width: ctx.W, height: ctx.H,
        props: { text: ctx.text, align: 'center', lineHeight: 1.1, fontFamily: 'Inter', fontWeight: 700, fontSize, color: '#ffffff' },
        transform: { x: 0, y: -(50 - (share * 100) / 2) },
      } as never,
    });
  },
};

interface Keyed { frame: number; value: number; easing?: string }
type Shrinkable = { transform?: { x?: number; y?: number; scale?: number }; keyframes?: Record<string, Keyed[]> };

/** Footage scaled to the area under the band: smaller about the centre, then moved down by half the band. */
export function underBand<T extends Shrinkable>(item: T, W: number, H: number): T {
  const share = bandShare(H, W);
  const s = 1 - share;
  const dy = (share * 100) / 2;
  const t = item.transform ?? {};
  const keys = Object.fromEntries(Object.entries(item.keyframes ?? {}).map(([prop, list]) => [prop,
    prop === 'scale' ? list.map((k) => ({ ...k, value: k.value * s }))
      : prop === 'x' ? list.map((k) => ({ ...k, value: k.value * s }))
        : prop === 'y' ? list.map((k) => ({ ...k, value: k.value * s + dy }))
          : list]));
  return {
    ...item,
    transform: { ...t, x: (t.x ?? 0) * s, y: (t.y ?? 0) * s + dy, scale: (t.scale ?? 1) * s },
    ...(item.keyframes ? { keyframes: keys } : {}),
  };
}
