// The four plain text styles of director mode (title shuffle, words on the beat, big title, caption) and the shared
// context every text style builds from.
import type { AtomicAction } from '../../editor/reducerActions';
import type { PlanValue } from '../../../shared/reelsmith/directorPlan';
import { scrambleStates } from '../assembler/postcardCollage';
import type { MoveParam } from './moves';

const num = (v: PlanValue | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: PlanValue | undefined, d: string) => (typeof v === 'string' ? v : d);

export interface TextContext {
  W: number;
  H: number;
  fps: number;
  start: number;
  end: number;
  beatFrame: (b: number) => number;
  beats: number;
  text: string;
  params: Record<string, PlanValue>;
  seed: number;
  id: (...parts: Array<string | number>) => string;
  /** text lane n of this text (0 = lowest) */
  lane: (n: number) => string;
  emit: (action: AtomicAction) => void;
  warn: (message: string) => void;
}

export interface TextStyleDef { id: string; name: string; looks: string; use: string; maxChars: number; params: MoveParam[]; build: (ctx: TextContext) => void }

function textAt(ctx: TextContext, lane: number, key: Array<string | number>, value: string, from: number, to: number, style: Record<string, unknown>, x: number, y: number, extra: Record<string, unknown> = {}): void {
  ctx.emit({
    type: 'add', startFrame: from,
    item: {
      id: ctx.id(...key), track: ctx.lane(lane), kind: 'text', name: value.slice(0, 24), durationInFrames: Math.max(1, to - from), width: ctx.W, height: ctx.H,
      props: { text: value, align: 'center', lineHeight: 1.05, ...style }, transform: { x, y }, ...extra,
    } as never,
  });
}
/** Font size so the longest line fits `share` of the width, given the face's average glyph width in em. */
const fit = (text: string, want: number, W: number, share: number, em: number) => Math.round(Math.max(28, Math.min(want, (W * share) / (Math.max(1, ...text.split('\n').map((l) => [...l].length)) * em))));
/** The text broken into 1-3 balanced lines, whichever lets it be biggest (a long title on one line ends up subtitle-sized). */
export function wrapToFit(text: string, want: number, W: number, share: number, em: number): { text: string; fontSize: number } {
  if (text.includes('\n')) return { text, fontSize: fit(text, want, W, share, em) };
  const words = text.split(/\s+/).filter(Boolean);
  let best = { text, fontSize: fit(text, want, W, share, em) };
  for (let n = 2; n <= Math.min(3, words.length); n++) {
    const target = text.length / n;
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      if (line && lines.length < n - 1 && (line + ' ' + w).length > target + w.length / 2) { lines.push(line); line = w; } else line = line ? `${line} ${w}` : w;
    }
    lines.push(line);
    const wrapped = lines.join('\n');
    const fontSize = fit(wrapped, want, W, share, em);
    if (fontSize > best.fontSize) best = { text: wrapped, fontSize };
  }
  return best;
}

export const titleShuffle: TextStyleDef = {
  id: 'title-shuffle', name: 'Shuffling place title', maxChars: 20,
  looks: 'Two small white words, then the title\'s letters shuffle for a moment and settle into big red condensed capitals that stay.',
  use: 'The place or the trip name, over a montage (as an overlay across several sections). Keep it to a name, 18 characters at most.',
  params: [
    { id: 'left', type: 'text', label: 'Small word, left', default: 'greetings' },
    { id: 'right', type: 'text', label: 'Small word, right', default: 'from' },
    { id: 'color', type: 'color', label: 'Title colour', default: '#ff0000' },
  ],
  build: (ctx) => {
    const place = ctx.text.toUpperCase();
    const base = Math.min(ctx.W, ctx.H);
    const size = fit(place, Math.round(base * 0.226), ctx.W, 0.78, 0.42);
    const small = Math.round(base * 0.057);
    const yPlace = (0.064 * 1080 / ctx.H) * 100 * (ctx.H > ctx.W ? 0 : 1);
    const yWords = yPlace - ((size * 0.6) / ctx.H) * 100;
    const spread = ctx.H > ctx.W ? 24 : 20;
    const fade = Math.round(0.3 * ctx.fps);
    const wordStyle = { fontFamily: 'Figtree', fontWeight: 300, fontSize: small, color: '#ffffff' };
    const left = str(ctx.params.left, 'greetings').trim();
    const right = str(ctx.params.right, 'from').trim();
    if (left) textAt(ctx, 0, ['tw-l'], left, ctx.start, ctx.end, wordStyle, -spread, yWords, { fadeOutFrames: fade });
    if (right) textAt(ctx, 1, ['tw-r'], right, ctx.start, ctx.end, wordStyle, spread, yWords, { fadeOutFrames: fade });
    const placeStyle = { fontFamily: 'Bebas Neue', fontWeight: 400, fontSize: size, color: str(ctx.params.color, '#ff0000'), rsFixedPosition: true };
    const s0 = ctx.start + Math.round(0.4 * ctx.fps);
    const s1 = Math.min(ctx.end - 1, s0 + Math.round(0.9 * ctx.fps));
    scrambleStates(place, Math.max(1, s1 - s0), ctx.seed).forEach((state, k) => textAt(ctx, 2, ['tshuf', k], state, s0 + k, s0 + k + 1, placeStyle, 0, yPlace));
    textAt(ctx, 2, ['tplace'], place, s1, ctx.end, placeStyle, 0, yPlace, { fadeOutFrames: fade });
  },
};

export const wordsOnBeat: TextStyleDef = {
  id: 'words-on-beat', name: 'Words on the beat', maxChars: 80,
  looks: 'The line one word at a time, each on a beat, in big white serif capitals in the middle of the frame.',
  use: 'The story line, punchy: "2 days / 6000 calories / one fort". 3-8 words per section.',
  params: [{ id: 'every', type: 'number', label: 'Beats per word', default: 1, min: 0.5, max: 4 }],
  build: (ctx) => {
    const words = ctx.text.split(/\s+/).filter(Boolean);
    const every = Math.max(0.5, Math.min(num(ctx.params.every, 1), ctx.beats / Math.max(1, words.length)));
    if (words.length * every > ctx.beats + 1e-6) ctx.warn(`"${ctx.text}" has more words than beats; some words are shown for less than ${every} beat.`);
    words.forEach((w, i) => {
      const a = ctx.beatFrame(i * every);
      const b = i === words.length - 1 ? ctx.end : ctx.beatFrame((i + 1) * every);
      if (a >= ctx.end) return;
      textAt(ctx, 0, ['word', i], w.toUpperCase(), a, Math.min(ctx.end, b), { fontFamily: 'Libre Baskerville', fontWeight: 400, fontSize: fit(w, Math.round(Math.min(ctx.W, ctx.H) * 0.122), ctx.W, 0.8, 0.84), color: '#ffffff' }, 0, 0);
    });
  },
};

export const bigTitle: TextStyleDef = {
  id: 'big-title', name: 'Big title', maxChars: 40,
  looks: 'A bold white title in the middle, fading in.',
  use: 'The name of the reel at the start, or a closing line.',
  params: [{ id: 'color', type: 'color', label: 'Colour', default: '#ffffff' }],
  build: (ctx) => {
    // uppercase in the text itself: the timeline's text items ignore textTransform (only captions apply it)
    const title = wrapToFit(ctx.text.toUpperCase(), Math.round(Math.min(ctx.W, ctx.H) * 0.13), ctx.W, 0.8, 0.5);
    textAt(ctx, 0, ['title'], title.text, ctx.start, ctx.end, {
      fontFamily: 'Anton', fontWeight: 400, fontSize: title.fontSize, color: str(ctx.params.color, '#ffffff'),
    }, 0, 0, { fadeInFrames: Math.round(0.3 * ctx.fps) });
  },
};

export const caption: TextStyleDef = {
  id: 'caption', name: 'Caption line', maxChars: 90,
  looks: 'A short sentence in clean white sans with a soft shadow, low in the frame (inside Instagram\'s safe area).',
  use: 'Telling the story in the user\'s words: "we almost turned back here".',
  params: [],
  build: (ctx) => {
    const line = wrapToFit(ctx.text, Math.round(Math.min(ctx.W, ctx.H) * 0.055), ctx.W, 0.78, 0.55);
    textAt(ctx, 0, ['caption'], line.text, ctx.start, ctx.end, {
      fontFamily: 'Inter', fontWeight: 600, fontSize: line.fontSize, color: '#ffffff',
      shadow: { color: '#000000a0', blurPx: 18, dx: 0, dy: 3 },
    }, 0, ctx.H > ctx.W ? 22 : 30, { fadeInFrames: Math.round(0.2 * ctx.fps) });
  },
};
