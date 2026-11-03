// Director text styles (RS-1202) built on the text engine (textGraphic.ts), plus two that live inside the picture as clip
// effects (behind you, landscape title). Each style chooses a preset, a typeface and a place, and says when it fits.
import type { AtomicAction } from '../../editor/reducerActions';
import type { PlanValue } from '../../../shared/reelsmith/directorPlan';
import { TEXT_GRAPHIC_CODE, type TextGraphicProps, type TextPreset } from './textGraphic';
import { POS_PARAMS, wrapToFit } from './basicTextStyles';
import type { MoveParam, TextContext, TextStyleDef } from './moves';

const num = (v: PlanValue | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: PlanValue | undefined, d: string) => (typeof v === 'string' ? v : d);

/** Average glyph width in em per typeface, for shrink-to-fit. */
const EM: Record<string, number> = {
  Anton: 0.46, 'Bebas Neue': 0.42, Montserrat: 0.66, 'Inter Tight': 0.58, Inter: 0.6, 'Space Mono': 0.6, 'Playfair Display': 0.62,
  'Cormorant Garamond': 0.55, Fredoka: 0.6, 'Archivo Black': 0.74, Poppins: 0.64, Caveat: 0.42,
};

interface Look {
  preset: TextPreset;
  fontFamily: string;
  fontWeight: number;
  /** share of the frame's short side */
  size: number;
  color: string;
  accent: string;
  spacing?: number;
  uppercase?: boolean;
  align?: 'left' | 'center' | 'right';
  /** position: x, y for 9:16 and for wider frames */
  tall: [number, number];
  wide: [number, number];
  maxWidth?: number;
  enter?: number;
  stagger?: number;
  shadow?: boolean;
  stroke?: { width: number; color: string };
  opacity?: number;
  subFontFamily?: string;
}

/**
 * When each slammed word lands, in seconds from the line's start: on every `every` beats, but the whole line must stay up
 * long enough to read before it leaves (about a second; "2 DAYS. ONE ROPE." on 2 beats a word was whole for 0.4 s,
 * 2026-10-28). Too slow for that, the words land on half or quarter the beats; slower still, evenly spaced.
 */
export function slamStarts(ctx: Pick<TextContext, 'start' | 'end' | 'fps' | 'beatFrame'>, words: number, every: number, enter = 0.28): number[] {
  const total = (ctx.end - ctx.start) / ctx.fps;
  const exit = Math.min(0.35, total * 0.15);
  const latest = Math.max(0, total - exit - Math.min(1.2, Math.max(0.8, total * 0.3)) - enter);
  const at = (e: number) => Array.from({ length: words }, (_, i) => (ctx.beatFrame(i * e) - ctx.start) / ctx.fps);
  for (const e of [every, every / 2, every / 4]) {
    const starts = at(e);
    if ((starts.at(-1) ?? 0) <= latest + 1e-6 && new Set(starts).size === starts.length) return starts;
  }
  return Array.from({ length: words }, (_, i) => (words > 1 ? (latest * i) / (words - 1) : 0));
}

/** The engine graphic for one line of text, sized to fit and placed for the frame's shape. */
function engine(ctx: TextContext, look: Look, extra: Partial<TextGraphicProps> = {}, key = 'text', lane = 0): void {
  const tall = ctx.H > ctx.W;
  const base = Math.min(ctx.W, ctx.H) * num(ctx.params.size, 1) * look.size;
  // capitals run about 20% wider than mixed case; tracking-in also starts wider than it ends
  const em = (EM[look.fontFamily] ?? 0.6) * (look.uppercase ? 1.2 : 1) + (look.spacing ?? 0) + (look.preset === 'tracking-in' ? 0.12 : 0);
  const maxWidth = look.maxWidth ?? 0.84;
  // a long line wraps into balanced lines before it shrinks: a 41-letter typewriter hook on one line came out 37px
  const { text, fontSize } = wrapToFit(ctx.text.replace(/\s*\/\s*/g, '\n'), Math.round(base), ctx.W, maxWidth, em);
  const [x, y] = tall ? look.tall : look.wide;
  const total = (ctx.end - ctx.start) / ctx.fps;
  const props: TextGraphicProps = {
    text, preset: look.preset, fontFamily: look.fontFamily, fontWeight: look.fontWeight, fontSize, color: str(ctx.params.color, look.color),
    accent: str(ctx.params.accent, look.accent), spacing: look.spacing ?? 0, uppercase: !!look.uppercase, align: look.align ?? 'center',
    x: num(ctx.params.x, x), y: num(ctx.params.y, y), maxWidth, enter: look.enter ?? 0.6, stagger: look.stagger ?? (undefined as unknown as number),
    exit: Math.min(0.35, total * 0.15), total, ...(look.shadow ? { shadow: true } : {}), ...(look.stroke ? { stroke: look.stroke } : {}),
    ...(look.opacity !== undefined ? { opacity: look.opacity } : {}), ...(look.subFontFamily ? { subFontFamily: look.subFontFamily } : {}), ...extra,
  };
  if (props.stagger === undefined) delete (props as Partial<TextGraphicProps>).stagger;
  ctx.emit({
    type: 'add', startFrame: ctx.start,
    item: { id: ctx.id(key), track: ctx.lane(lane), kind: 'motion-graphic', name: ctx.text.slice(0, 24), code: TEXT_GRAPHIC_CODE, durationInFrames: Math.max(1, ctx.end - ctx.start), width: ctx.W, height: ctx.H, props } as never,
  } as AtomicAction);
}

const COLOR: MoveParam = { id: 'color', type: 'color', label: 'Text colour', default: '#ffffff' };
const ACCENT = (d: string): MoveParam => ({ id: 'accent', type: 'color', label: 'Accent colour', default: d });
const SIZE: MoveParam = { id: 'size', type: 'number', label: 'Size (1 = normal)', default: 1, min: 0.4, max: 2 };
const POS: MoveParam[] = POS_PARAMS;
// -1 means "the style's own place"
const place = (ctx: TextContext): TextContext => {
  const { x, y, ...rest } = ctx.params;
  return { ...ctx, params: { ...rest, ...(num(x, -1) >= 0 ? { x: x! } : {}), ...(num(y, -1) >= 0 ? { y: y! } : {}) } };
};

function style(id: string, name: string, looks: string, use: string, maxChars: number, look: Look, extraParams: MoveParam[] = [], extra?: (ctx: TextContext) => Partial<TextGraphicProps>): TextStyleDef {
  return {
    id, name, looks, use, maxChars, params: [COLOR, ACCENT(look.accent), SIZE, ...POS, ...extraParams],
    build: (raw) => { const ctx = place(raw); engine(ctx, look, extra?.(ctx) ?? {}); },
  };
}

export const ENGINE_STYLES: readonly TextStyleDef[] = [
  style('cinematic-title', 'Cinematic title', 'Thin, very widely spaced capitals that fade in from a blur, letter by letter.', 'A place or trip name over a wide view; calm, premium openers and endings.', 22,
    { preset: 'blur-in', fontFamily: 'Montserrat', fontWeight: 300, size: 0.085, color: '#ffffff', accent: '#ffffff', spacing: 0.45, uppercase: true, tall: [0.5, 0.36], wide: [0.5, 0.3], enter: 0.9, opacity: 0.92 }),
  style('tracking-in', 'Tracking in', 'Elegant serif capitals whose letter spacing closes in as they appear.', 'Luxury, weddings, slow travel, a refined ending line.', 28,
    { preset: 'tracking-in', fontFamily: 'Cormorant Garamond', fontWeight: 600, size: 0.09, color: '#ffffff', accent: '#ffffff', spacing: 0.18, uppercase: true, tall: [0.5, 0.42], wide: [0.5, 0.45], enter: 1.1, shadow: true }),
  style('typewriter', 'Typewriter', 'Monospaced text typed letter by letter with a blinking cursor.', 'Notes, times and facts ("Day 1 · 5:40 am"), diary entries, a hook question.', 60,
    { preset: 'typewriter', fontFamily: 'Space Mono', fontWeight: 700, size: 0.062, color: '#ffffff', accent: '#ffd23f', align: 'left', tall: [0.08, 0.7], wide: [0.06, 0.8], stagger: 0.055, shadow: true }),
  style('location-tag', 'Location tag', 'A map pin pops in, the place name types out, and a small detail line (altitude, coordinates, date) fades in under it.', 'Arriving somewhere: the first shot of a new place. Put the details in params.sub.', 30,
    { preset: 'location', fontFamily: 'Montserrat', fontWeight: 700, size: 0.06, color: '#ffffff', accent: '#ff4d4d', align: 'left', tall: [0.08, 0.72], wide: [0.06, 0.8], stagger: 0.05, shadow: true, subFontFamily: 'Inter' },
    [{ id: 'sub', type: 'text', label: 'Detail line', default: '' }], (ctx) => ({ sub: str(ctx.params.sub, '').toUpperCase() })),
  style('rise-lines', 'Rising lines', 'Bold lines slide up out of an invisible line, one after another (split lines with "/").', 'A 2-3 line statement: "2 days / 18 km / 1 fort". Punchy, modern.', 60,
    { preset: 'rise', fontFamily: 'Inter Tight', fontWeight: 800, size: 0.1, color: '#ffffff', accent: '#ffffff', align: 'left', tall: [0.08, 0.45], wide: [0.07, 0.5], enter: 0.5, stagger: 0.18, shadow: true }),
  style('slam', 'Word slam', 'Huge condensed words slam in one per beat with a small shake.', 'The drop of the song, hype, a three-word punchline.', 40,
    { preset: 'slam', fontFamily: 'Anton', fontWeight: 400, size: 0.2, color: '#ffffff', accent: '#ffffff', uppercase: true, tall: [0.5, 0.48], wide: [0.5, 0.5], enter: 0.28, shadow: true },
    [{ id: 'every', type: 'number', label: 'Beats per word', default: 1, min: 0.25, max: 4 }],
    (ctx) => ({ beats: slamStarts(ctx, ctx.text.split(/\s+/).filter(Boolean).length, num(ctx.params.every, 1)) })),
  style('count-up', 'Count-up', 'Numbers in the line roll up from zero; a small label can sit under it.', 'Stats: "6000 calories", "1,424 m", "18 km". Put the label in params.sub.', 30,
    { preset: 'count-up', fontFamily: 'Bebas Neue', fontWeight: 400, size: 0.22, color: '#ffffff', accent: '#ffffff', tall: [0.5, 0.45], wide: [0.5, 0.45], enter: 1.2, shadow: true },
    [{ id: 'sub', type: 'text', label: 'Label under it', default: '' }], (ctx) => ({ sub: str(ctx.params.sub, '').toUpperCase() })),
  style('wave', 'Wave', 'Rounded letters that bob up and down in a wave.', 'Playful, kids, beach, friends, happy moments.', 30,
    { preset: 'wave', fontFamily: 'Fredoka', fontWeight: 600, size: 0.11, color: '#ffffff', accent: '#ffffff', tall: [0.5, 0.42], wide: [0.5, 0.45], shadow: true }),
  style('glitch', 'Glitch in', 'Letters jitter in with red and cyan colour splits, then lock.', 'Tech, night out, gaming, a beat drop.', 30,
    { preset: 'glitch', fontFamily: 'Space Mono', fontWeight: 700, size: 0.09, color: '#ffffff', accent: '#ffffff', uppercase: true, tall: [0.5, 0.45], wide: [0.5, 0.45], enter: 0.7, shadow: true }),
  style('neon', 'Neon sign', 'Handwritten glowing tube letters that flicker on, then hum.', 'Night, city, bars, parties, romance.', 28,
    { preset: 'neon', fontFamily: 'Caveat', fontWeight: 700, size: 0.14, color: '#ffffff', accent: '#ff2fb3', tall: [0.5, 0.4], wide: [0.5, 0.4], enter: 0.8 }),
  style('split-reveal', 'Split reveal', 'The top and bottom halves of heavy capitals slide in from opposite sides and lock.', 'A bold chapter title: "DAY 2", "THE SUMMIT".', 20,
    { preset: 'split', fontFamily: 'Archivo Black', fontWeight: 400, size: 0.12, color: '#ffffff', accent: '#ffffff', uppercase: true, tall: [0.5, 0.45], wide: [0.5, 0.45], enter: 0.55, shadow: true }),
  style('highlight', 'Marker highlight', 'Dark bold words on a bright marker stroke that sweeps behind each word.', 'Tips, lists, a key phrase to remember; clean and readable on busy footage.', 50,
    { preset: 'highlight', fontFamily: 'Inter', fontWeight: 800, size: 0.078, color: '#111111', accent: '#ffe14d', tall: [0.5, 0.68], wide: [0.5, 0.78], enter: 0.3, stagger: 0.12 }),
  style('draw-on', 'Drawn title', 'Serif letters are drawn as outlines, then fill in.', 'Elegant openers, memories, a handmade feel.', 24,
    { preset: 'draw-on', fontFamily: 'Playfair Display', fontWeight: 700, size: 0.11, color: '#ffffff', accent: '#ffffff', tall: [0.5, 0.42], wide: [0.5, 0.42], enter: 1.4, stagger: 0.06 }),
  style('shine', 'Gold shine', 'Gold serif text with a light streak sweeping across it.', 'Celebrations, achievements, luxury, the summit moment.', 24,
    { preset: 'shine', fontFamily: 'Cormorant Garamond', fontWeight: 700, size: 0.12, color: '#d9b25f', accent: '#ffffff', uppercase: true, spacing: 0.06, tall: [0.5, 0.42], wide: [0.5, 0.42], enter: 0.8, shadow: true }),
  style('pop-words', 'Pop captions', 'Words pop in one at a time, the newest in a bright colour (creator caption style).', 'Talking, storytelling, a spoken-style line in the lower third.', 90,
    { preset: 'pop-words', fontFamily: 'Poppins', fontWeight: 800, size: 0.082, color: '#ffffff', accent: '#ffd23f', tall: [0.5, 0.68], wide: [0.5, 0.8], enter: 0.22, stagger: 0.28, stroke: { width: 3, color: '#000000' }, shadow: true, maxWidth: 0.8 }),
];

/** Styles drawn inside the picture: they ride on the section's main clips as an effect, and need suitable footage. */
export interface ClipTextStyle extends TextStyleDef { clipEffect: (ctx: TextContext) => { assetId: string; overrides: Record<string, number> } }

const behindYou: ClipTextStyle = {
  id: 'behind-you', name: 'Text behind you', maxChars: 14,
  looks: 'One huge word in scrolling rows passes behind the person; they stay in front of it.',
  use: 'A clear person in the shot (portrait, dance, walking to camera). One short word: the place, a mood ("FREEDOM").',
  params: [{ id: 'speed', type: 'number', label: 'Scroll speed', default: 1, min: 0, max: 3 }],
  build: () => {},
  clipEffect: (ctx) => ({ assetId: 'builtin:fx-text-behind', overrides: { speed: num(ctx.params.speed, 1) } }),
};

/**
 * Letter height (share of the frame height) that makes a landscape title span about 72% of a tall frame (50% of a wide
 * one): the sky title is drawn from a cell of thin capitals spaced wide (gl/textLayer.ts sceneryCellFor, about 183 px a
 * letter plus a 120 px margin on a 320 px line), so its width follows the word's length. A fixed height left a short
 * word ("AMK") a fifth of the frame wide and barely visible.
 */
export function sceneryTitleSize(text: string, W: number, H: number): number {
  const aspect = ([...text.trim()].length * 183 + 120) / 320;
  const tall = H > W;
  const size = (tall ? 0.72 : 0.5) / (aspect * (H / W));
  return Math.round(Math.min(tall ? 0.2 : 0.25, Math.max(0.03, size)) * 1000) / 1000;
}

const landscape: ClipTextStyle = {
  id: 'landscape-title', name: 'Landscape title', maxChars: 16,
  looks: 'Thin, widely spaced outlined capitals rise from behind the mountains into the sky and stay there; the ridges stay in front.',
  use: 'The place name over a wide view with open sky (mountains, sea, desert, skyline). Not for indoor or close shots.',
  params: [
    { id: 'y', type: 'number', label: 'Height in the frame (0 top)', default: 0.2, min: 0.05, max: 0.6 },
    { id: 'rise', type: 'number', label: 'Rise (seconds)', default: 1.8, min: 0.2, max: 5 },
    { id: 'solid', type: 'boolean', label: 'Solid letters instead of outlines', default: false },
  ],
  build: () => {},
  clipEffect: (ctx) => ({ assetId: 'builtin:fx-text-scenery', overrides: { y: num(ctx.params.y, 0.2), rise: num(ctx.params.rise, 1.8), outline: ctx.params.solid === true ? 0 : 1, size: sceneryTitleSize(ctx.text, ctx.W, ctx.H) } }),
};

const followTag: ClipTextStyle = {
  id: 'follow-tag', name: 'Follow tag', maxChars: 24,
  looks: 'A small label on a dark pill rides above the person\'s head and follows them as they move (body-tracked text).',
  use: 'Name or role of the person in the shot ("me", "the planner", "@friend"), a short joke label. Needs one clear person in video footage.',
  params: [{ id: 'size', type: 'number', label: 'Label height', default: 0.045, min: 0.02, max: 0.12 }],
  build: () => {},
  clipEffect: (ctx) => ({ assetId: 'builtin:fx-follow-tag', overrides: { size: num(ctx.params.size, 0.045) } }),
};

export const CLIP_TEXT_STYLES: readonly ClipTextStyle[] = [behindYou, landscape, followTag];
export const isClipTextStyle = (s: TextStyleDef): s is ClipTextStyle => 'clipEffect' in s;
