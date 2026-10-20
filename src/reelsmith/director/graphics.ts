// RS-1213: graphics on top of a directed reel, the "every frame is code" layer: a route map between the places, a
// boarding pass, chat bubbles, a phone notification, a marker circle or arrow on the person, stickers, confetti, a
// countdown, HUD readouts, story chapter bars, a loading bar, a camcorder viewfinder and full-screen kinetic type. A plan
// places them by section (plan.graphics); each is one motion-graphic item that moves on the song's beats and brings its
// own sounds. The agent can also write its own (reels_custom_graphic) and name it custom:gfx-<name>.
import type { AtomicAction } from '../../editor/reducerActions';
import type { PlanGraphic, PlanValue, ReelPlan } from '../../../shared/reelsmith/directorPlan';
import type { MoveParam } from './moveKit';
import type { SfxCue } from './sfx';
import { getCustomGraphic } from './customGraphics';
import { BOARDING_PASS_CODE, CAMCORDER_CODE, CHAPTER_BAR_CODE, HUD_STATS_CODE, LOADING_BAR_CODE, ROUTE_MAP_CODE } from './graphicsTravel';
import { ANNOTATE_CODE, CHAT_BUBBLES_CODE, CONFETTI_CODE, COUNTDOWN_CODE, NOTIFICATION_CODE, STICKER_CODE, TYPE_STACK_CODE } from './graphicsSocial';

/** What a graphic knows when its sounds are placed: its words, params, length and beat clock (seconds from its start). */
export interface GraphicTiming { items: string[]; params: Record<string, PlanValue>; total: number; beatSec: (b: number) => number }

export interface GraphicDef {
  id: string;
  name: string;
  looks: string;
  use: string;
  /** its words: items split on "/" (min-max), at most `max` characters; null = it takes no words */
  text: { required: boolean; max: number; items: [number, number]; hint: string } | null;
  params: MoveParam[];
  code: string;
  /** points at the person's face in the shot under it (x/y left at -1) */
  focus?: boolean;
  sounds?: (g: GraphicTiming) => Array<{ sec: number; cue: SfxCue }>;
}

const n = (v: PlanValue | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const color = (id: string, label: string, d: string): MoveParam => ({ id, type: 'color', label, default: d });
const choice = (id: string, label: string, options: string[]): MoveParam => ({ id, type: 'enum', label, default: options[0]!, options });
const words = (id: string, label: string, d = ''): MoveParam => ({ id, type: 'text', label, default: d });
const EVERY = (d: number): MoveParam => ({ id: 'every', type: 'number', label: 'Beats between items', default: d, min: 0.5, max: 8 });
const X: MoveParam = { id: 'x', type: 'number', label: 'Across (0 left .. 1 right; -1 its own place)', default: -1, min: -1, max: 1 };
const Y: MoveParam = { id: 'y', type: 'number', label: 'Down (0 top .. 1 bottom; -1 its own place)', default: -1, min: -1, max: 1 };
/** item i arrives at beat i x every (the first a moment after the start) */
const perItem = (g: GraphicTiming, cue: SfxCue, first = 0.12) => g.items.map((_, i) => ({ sec: i === 0 ? first : g.beatSec(i * n(g.params.every, 1)), cue }));

export const GRAPHICS: readonly GraphicDef[] = [
  {
    id: 'route-map', name: 'Route map', code: ROUTE_MAP_CODE,
    looks: 'A map card; a dashed route draws from place to place with a plane (or car) travelling along it, and a pin pops at each stop with its name.',
    use: 'The journey: "Mumbai / Lonavala / Harishchandragad". Over a calm shot or a black section, 4-8 beats; the opener of a trip or the move to a new place.',
    text: { required: true, max: 80, items: [2, 6], hint: 'the stops in order, split with "/"' },
    params: [choice('icon', 'Travelling icon', ['plane', 'car', 'dot']), choice('look', 'Card', ['dark', 'paper']), { id: 'full', type: 'boolean', label: 'Fill the whole frame', default: false }, words('sub', 'Small line on the card (the user\'s distance or dates)'), color('accent', 'Route colour', '#ff3b5c'), Y],
    sounds: () => [{ sec: 0.25, cue: 'pop' }, { sec: 0.45, cue: 'whoosh-soft' }],
  },
  {
    id: 'boarding-pass', name: 'Boarding pass', code: BOARDING_PASS_CODE,
    looks: 'A paper boarding pass slides up and settles at a tilt: FROM and TO in big letters, a plane flies the dotted arc between them, a barcode stub; an optional stamp thumps on.',
    use: 'A flight or trip start: "Delhi / Goa". 4-6 beats at the opener. Only the user\'s places and details; never invent flight numbers.',
    text: { required: true, max: 40, items: [2, 2], hint: 'from / to' },
    params: [words('sub', 'Detail line (the user\'s date or note)'), words('stamp', 'Stamp word ("BOARDED", "FINALLY")'), words('title', 'Header', 'BOARDING PASS'), color('accent', 'Header colour', '#ff3b5c'), Y],
    sounds: (g) => [{ sec: 0.12, cue: 'whoosh-soft' }, ...(g.params.stamp ? [{ sec: g.total * 0.55, cue: 'click' as SfxCue }] : [])],
  },
  {
    id: 'chat-bubbles', name: 'Chat bubbles', code: CHAT_BUBBLES_CODE,
    looks: 'Phone chat bubbles pop in one per beat (grey from them, blue from you), with typing dots before theirs; an emoji-only message shows big.',
    use: 'A joke or the setup of the story as a text conversation: "are we there yet / 2 more hours / 😭". Mark your own messages with ">" (else they alternate). 6-12 beats.',
    text: { required: true, max: 140, items: [1, 8], hint: 'messages split with "/"; ">" in front marks the user\'s own' },
    params: [choice('theme', 'Theme', ['dark', 'light']), words('name', 'Contact name above the chat'), EVERY(2), color('accent', 'Your bubble colour', '#0a84ff'), Y],
    sounds: (g) => perItem(g, 'message', 0.15),
  },
  {
    id: 'notification', name: 'Notification', code: NOTIFICATION_CODE,
    looks: 'Phone notification banners drop in at the top, newest on top, the older ones pushed down.',
    use: 'A reaction or a joke: "Mom / where are you??", "Boss / are you coming in today". Pairs of title / message, up to 4 banners, one every 2 beats.',
    text: { required: true, max: 140, items: [1, 8], hint: 'title / message pairs split with "/" (one item = a message from the app)' },
    params: [words('app', 'App name', 'Messages'), words('time', 'Time', 'now'), choice('theme', 'Theme', ['dark', 'light']), EVERY(2), color('iconColor', 'App icon colour', '#34c759')],
    sounds: (g) => Array.from({ length: Math.max(1, Math.floor(g.items.length / 2)) }, (_, i) => ({ sec: i === 0 ? 0.1 : g.beatSec(i * n(g.params.every, 2)), cue: 'ping' as SfxCue })),
  },
  {
    id: 'annotate', name: 'Marker mark', code: ANNOTATE_CODE, focus: true,
    looks: 'A hand-drawn marker circle, arrow, box, underline or cross draws itself on the person\'s face (found in the shot), with a handwritten label.',
    use: '"that\'s me", "the one who planned this", pointing at someone in a group. One person clear in a video or photo; 3-6 beats.',
    text: { required: false, max: 24, items: [0, 1], hint: 'the handwritten label' },
    params: [choice('shape', 'Mark', ['circle', 'arrow', 'box', 'underline', 'cross']), color('color', 'Marker colour', '#ff3b30'), { id: 'size', type: 'number', label: 'Label size', default: 1, min: 0.5, max: 2 }, X, Y],
  },
  {
    id: 'sticker', name: 'Stickers', code: STICKER_CODE,
    looks: 'Emoji or word stickers with a white die-cut edge pop in on the beat, tilted, and wiggle.',
    use: 'Reactions and jokes: "🔥", "😂 / 💀", "OMG". 1-4 stickers, 2-6 beats; playful reels only.',
    text: { required: true, max: 40, items: [1, 4], hint: 'emoji or short words, split with "/"' },
    params: [EVERY(1), { id: 'size', type: 'number', label: 'Size', default: 1, min: 0.4, max: 2.5 }, color('accent', 'Word sticker colour', '#ff2e63'), color('color', 'Second word sticker colour', '#1d9bf0'), X, Y],
    sounds: (g) => perItem(g, 'pop', 0.05),
  },
  {
    id: 'confetti', name: 'Confetti', code: CONFETTI_CODE,
    looks: 'Confetti (or hearts, sparkles, an emoji) bursts from both bottom corners and flutters down, or rains from the top.',
    use: 'The payoff: the summit, a birthday, "we did it", the drop of a happy song. Burst for 3-6 beats; rain for longer.',
    text: { required: false, max: 8, items: [0, 1], hint: 'the emoji for kind "emoji"' },
    params: [choice('kind', 'Pieces', ['confetti', 'hearts', 'sparkles', 'emoji']), choice('mode', 'Motion', ['burst', 'rain']), { id: 'count', type: 'number', label: 'Pieces', default: 140, min: 10, max: 180 }, color('accent', 'Main colour', '#ff3b5c')],
    sounds: (g) => (g.params.mode === 'rain' ? [] : [{ sec: 0.1, cue: 'chime' }]),
  },
  {
    id: 'countdown', name: 'Countdown', code: COUNTDOWN_CODE,
    looks: 'Big numbers land one per beat inside a ring that sweeps around; the last word hits in the accent colour.',
    use: 'Into the drop or a reveal: "3 / 2 / 1 / GO". Plan it to end where the drop starts.',
    text: { required: false, max: 40, items: [0, 6], hint: 'the counts, split with "/" (default 3 / 2 / 1)' },
    params: [EVERY(1), color('color', 'Number colour', '#ffffff'), color('accent', 'Last word colour', '#ffd23f'), { id: 'dim', type: 'boolean', label: 'Darken the picture under it', default: true }],
    sounds: (g) => { const list = g.items.length ? g.items : ['3', '2', '1']; return list.map((_, i) => ({ sec: g.beatSec(i * n(g.params.every, 1)), cue: (i === list.length - 1 ? 'hit' : 'ding') as SfxCue })); },
  },
  {
    id: 'hud-stats', name: 'HUD readout', code: HUD_STATS_CODE,
    looks: 'Sci-fi HUD lines draw in one per beat: a small label, a big number that counts up, a scan line, and a turning reticle.',
    use: 'Facts the user gave: "ALT 1424 m / DIST 18 km / TIME 6 h". Action, treks, sport, drives. Only numbers the user stated.',
    text: { required: true, max: 90, items: [1, 5], hint: '"LABEL value" lines split with "/"' },
    params: [EVERY(1), color('accent', 'HUD colour', '#35e0ff'), X, Y],
    sounds: (g) => perItem(g, 'click', 0.15),
  },
  {
    id: 'chapter-bar', name: 'Chapter bars', code: CHAPTER_BAR_CODE,
    looks: 'Story-style progress bars across the top, one per section it spans, filling as the reel plays, with the chapter name under them.',
    use: 'A reel told in chapters: "Day 1 / Day 2 / Summit" over sections 1-3 (one label per section). Spans several sections.',
    text: { required: false, max: 80, items: [0, 12], hint: 'one label per section it spans, split with "/"' },
    params: [color('color', 'Bar colour', '#ffffff')],
  },
  {
    id: 'loading-bar', name: 'Loading bar', code: LOADING_BAR_CODE,
    looks: 'A chunky retro loading bar fills in stutters, hangs at 99%, then completes with a pop and the done line.',
    use: 'A meme intro or build-up: "loading weekend... / 100% vacation". 4-8 beats; ends where the payoff starts.',
    text: { required: true, max: 50, items: [1, 2], hint: 'label / done line' },
    params: [choice('look', 'Style', ['retro', 'clean']), color('accent', 'Done colour', '#3cff7a'), color('color', 'Bar colour', '#ffffff'), Y],
    sounds: (g) => [{ sec: Math.max(0.8, g.total - Math.min(0.35, g.total * 0.15) - 0.6), cue: 'chime' }],
  },
  {
    id: 'camcorder', name: 'Camcorder', code: CAMCORDER_CODE,
    looks: 'A camcorder viewfinder: corner brackets, a blinking REC dot, a running timecode, a battery and an orange date stamp.',
    use: 'Throwbacks, vlogs, "the footage from that night", with retro looks. Spans several sections. The date only if the user gave it.',
    text: { required: false, max: 20, items: [0, 1], hint: 'the date stamp' },
    params: [choice('mode', 'Mode', ['rec', 'play']), color('color', 'Date colour', '#ffb02e')],
  },
  {
    id: 'type-stack', name: 'Kinetic type', code: TYPE_STACK_CODE,
    looks: 'Huge condensed words stack to fill the frame; each is revealed by a colour block that wipes in and off on its beat; the rows leave upward together.',
    use: 'The motion-designer hook or the punchline: "ONE / LAST / TRIP". 2-5 words, one per beat. Over dimmed footage, or solid on a black section.',
    text: { required: true, max: 60, items: [2, 6], hint: 'words or short lines, split with "/"' },
    params: [EVERY(1), color('color', 'Text colour', '#ffffff'), color('accent', 'Block colour', '#ff3b5c'), { id: 'solid', type: 'boolean', label: 'Solid background instead of the dimmed picture', default: false }, color('background', 'Solid background colour', '#111111'), Y],
    sounds: (g) => perItem(g, 'click', 0.05),
  },
];

export const graphicById = (id: string): GraphicDef | undefined => GRAPHICS.find((g) => g.id === id) ?? customGraphicDef(id);

function customGraphicDef(id: string): GraphicDef | undefined {
  const c = getCustomGraphic(id);
  return c && { id: c.id, name: c.name, looks: c.looks, use: c.looks, code: c.code, params: c.params, text: { required: false, max: 140, items: [0, 12], hint: 'words, split with "/"' } };
}

export const MAX_GRAPHICS = 8;
const splitItems = (text: string | undefined) => (text ? text.split('/').map((s) => s.trim()).filter(Boolean) : []);

/** Catalogue problems in plan.graphics, before anything is built. */
export function checkGraphics(plan: ReelPlan, errors: string[], resolveParams: (defs: readonly MoveParam[], given: Record<string, PlanValue> | undefined, where: string, errors: string[]) => Record<string, PlanValue>): void {
  const list = plan.graphics ?? [];
  if (list.length > MAX_GRAPHICS) errors.push(`at most ${MAX_GRAPHICS} graphics in a reel (the plan has ${list.length})`);
  const customs = new Set(list.map((g) => g.graphic).filter((id) => id.startsWith('custom:')));
  if (customs.size > 1) errors.push(`use one custom graphic per reel (the plan has ${customs.size}); reuse it where the story returns to it`);
  list.forEach((g, k) => {
    const where = `graphics[${k}]`;
    const def = graphicById(g.graphic);
    if (!def) { errors.push(`${where}: unknown graphic "${g.graphic}"${g.graphic.startsWith('custom:') ? ' (write it again with reels_custom_graphic)' : ''}`); return; }
    if (g.to >= plan.sections.length || g.from >= plan.sections.length) errors.push(`${where}: from/to must be section indexes below ${plan.sections.length}`);
    const items = splitItems(g.text);
    if (!def.text && g.text) errors.push(`${where}: ${def.id} takes no text`);
    if (def.text) {
      if (def.text.required && !items.length) errors.push(`${where}: ${def.id} needs text: ${def.text.hint}`);
      if ((g.text ?? '').length > def.text.max) errors.push(`${where}: text is longer than ${def.text.max} characters for ${def.id}`);
      if (items.length && (items.length < def.text.items[0] || items.length > def.text.items[1])) errors.push(`${where}: ${def.id} takes ${def.text.items[0]}-${def.text.items[1]} items (${def.text.hint}); got ${items.length}`);
    }
    resolveParams(def.params, g.params, where, errors);
  });
}

export interface GraphicsBuild {
  W: number;
  H: number;
  fps: number;
  /** reel seconds of fractional reel beat b */
  clock: (b: number) => number;
  /** each section's first and last beat on the reel clock */
  sectionBeats: Array<{ b0: number; b1: number }>;
  /** the person's face in the shot under (section, reel frame), as fractions of the frame and a radius */
  focusAt: (section: number, frame: number) => { x: number; y: number; r: number } | undefined;
  resolveParams: (defs: readonly MoveParam[], given: Record<string, PlanValue> | undefined, where: string, errors: string[]) => Record<string, PlanValue>;
  id: (...p: Array<string | number>) => string;
  emit: (a: AtomicAction) => void;
  sound: (frame: number, cue: SfxCue) => void;
  warn: (m: string) => void;
}

/** Graphic lanes sit above every text lane (T1..T29 are sections' and overlays' lines). */
const LANE_BASE = 30;

export function buildGraphics(list: readonly PlanGraphic[], b: GraphicsBuild): void {
  const lanes: number[] = [];
  const last = b.sectionBeats.at(-1)?.b1 ?? 0;
  const placed = list.map((g, k) => {
    const s0 = b.sectionBeats[g.from]!, s1 = b.sectionBeats[Math.max(g.from, g.to)]!;
    const gb0 = Math.min(s0.b1 - 0.25, s0.b0 + (g.beat ?? 0));
    const gb1 = Math.min(last, g.beats !== undefined ? gb0 + g.beats : s1.b1);
    return { g, k, gb0, gb1, start: Math.round(b.clock(gb0) * b.fps), end: Math.round(b.clock(gb1) * b.fps) };
  }).sort((x, y) => x.start - y.start);
  for (const { g, k, gb0, gb1, start, end: rawEnd } of placed) {
    const def = graphicById(g.graphic)!;
    const end = Math.max(start + Math.round(b.fps * 0.5), rawEnd);
    const total = (end - start) / b.fps;
    const params = b.resolveParams(def.params, g.params, `graphics[${k}]`, []);
    const items = splitItems(g.text);
    const t0 = b.clock(gb0);
    const beatSec = (x: number) => b.clock(gb0 + x) - t0;
    const props: Record<string, unknown> = {
      ...params, items, total, beats: Array.from({ length: Math.ceil(gb1 - gb0) + 2 }, (_, i) => Math.round(beatSec(i) * 1000) / 1000),
      sections: b.sectionBeats.slice(g.from, Math.max(g.from, g.to) + 1).map((s) => Math.max(0, Math.round((b.clock(s.b0) - t0) * 1000) / 1000)),
      rsGraphic: def.id, ...(def.id.startsWith('custom:') ? { rsGraphicParams: def.params } : {}),
    };
    // -1 is "its own place": leave it to the graphic
    for (const key of ['x', 'y']) if (n(params[key], 0) < 0) delete props[key];
    if (def.id === 'type-stack') props.background = params.solid === true ? params.background : 'none';
    if (def.focus) {
      const f = b.focusAt(g.from, start + Math.round(b.fps * 0.3));
      const x = n(params.x, -1), y = n(params.y, -1);
      if (x >= 0 || y >= 0 || !f) {
        if (!f && x < 0 && y < 0) b.warn(`graphics[${k}] (${def.id}): no face found in the shot under it; it points at the middle. Set params x and y, or put it on a shot with one clear person.`);
        Object.assign(props, { tx: x >= 0 ? x : f?.x ?? 0.5, ty: y >= 0 ? y : f?.y ?? 0.4, tr: x >= 0 || y >= 0 ? 0.07 : f?.r ?? 0.12 });
      } else Object.assign(props, { tx: f.x, ty: f.y, tr: f.r });
    }
    let lane = lanes.findIndex((e) => e <= start);
    if (lane < 0) { lane = lanes.length; lanes.push(0); }
    lanes[lane] = end;
    b.emit({
      type: 'add', startFrame: start,
      item: { id: b.id('gfx', k), track: `T${LANE_BASE + lane}`, kind: 'motion-graphic', name: `${def.name}${items[0] ? `: ${items[0].slice(0, 20)}` : ''}`, code: def.code, durationInFrames: end - start, width: b.W, height: b.H, props } as never,
    } as AtomicAction);
    for (const s of def.sounds?.({ items, params, total, beatSec }) ?? []) if (s.sec >= 0 && s.sec < total) b.sound(start + Math.round(s.sec * b.fps), s.cue);
  }
}

/**
 * Where a face sits on the canvas, from the clip's face (or subject) rect, for a full-frame shot fitted with cover:
 * the shot is scaled to fill the frame and centred, so the rect moves by the crop.
 */
export function coverFocus(rect: { x: number; y: number; w: number; h: number }, src: { width: number; height: number }, W: number, H: number) {
  // no face found: the rect is the whole person (taller than wide in pixels), so aim at their head near its top
  if (rect.w * rect.h > 0.8) return undefined;
  const body = rect.h * src.height > rect.w * src.width * 1.3;
  const head = body ? { x: rect.x + rect.w * 0.3, y: rect.y, w: rect.w * 0.4, h: Math.min(rect.h * 0.18, (rect.w * 0.4 * src.width) / src.height) } : rect;
  const scale = Math.max(W / src.width, H / src.height);
  const dw = src.width * scale, dh = src.height * scale;
  const x = ((head.x + head.w / 2) * dw - (dw - W) / 2) / W;
  const y = ((head.y + head.h / 2) * dh - (dh - H) / 2) / H;
  const r = (Math.max(head.w * dw, head.h * dh) / 2) / Math.min(W, H);
  if (x < 0 || x > 1 || y < 0 || y > 1) return undefined;
  return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, r: Math.round(Math.min(0.3, Math.max(0.05, r)) * 1000) / 1000 };
}
