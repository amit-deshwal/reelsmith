// Frame-in-frame moves: picture-in-picture (a second shot in a rounded window over the first) and film strip (the
// clips play in the frames of a strip of film running through the picture, the last frame growing to fill it).
// Picture-in-picture is plain clip items, so crop focus, looks and the export treat both shots like any other; the
// film strip is one window-player graphic (postcardGraphics.ts), like the card finale.
import type { Keyframe } from '../../editor/types';
import type { AssemblyClip } from '../assembler/types';
import type { GraphicSource, GraphicWindow, Rect, WindowKey } from '../postcardGraphics';
import { safeRect } from '../safeZone';
import { focusForRange } from '../titleClear';
import { bool, clipAt, graphic, num, solid, source, str, type MoveContext, type MoveDef } from './moveKit';

// ---- picture-in-picture ------------------------------------------------------------------------------------------

export type PipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
const CORNERS: PipCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export interface PipBox { x: number; y: number; w: number; h: number }

/**
 * The inset's box in composition pixels: the reel's own shape at `size` of its width, in the corner, inside the part of
 * the frame Instagram's buttons and captions leave free (the safe zone on a 9:16 reel; a margin on any shape).
 */
export function pipBox(W: number, H: number, size: number, corner: PipCorner): PipBox {
  const w = W * size, h = H * size;
  const m = Math.round(Math.min(W, H) * 0.045);
  const safe = H > W ? safeRect({ width: W, height: H }) : { x: 0, y: 0, w: W, h: H };
  const left = Math.max(m, safe.x), right = Math.min(W - m, safe.x + safe.w);
  const top = Math.max(m, safe.y), bottom = Math.min(H - m, safe.y + safe.h);
  return {
    x: corner.endsWith('left') ? left : right - w,
    y: corner.startsWith('top') ? top : Math.max(top, bottom - h),
    w, h,
  };
}

/** 'auto' puts the inset on the side away from the person in the main shot, at the top (captions live at the bottom). */
export function pipCorner(want: string, focusX: number | undefined): PipCorner {
  if ((CORNERS as string[]).includes(want)) return want as PipCorner;
  return focusX !== undefined && focusX > 0.5 ? 'top-left' : 'top-right';
}

export const pictureInPicture: MoveDef = {
  id: 'pip', name: 'Picture-in-picture',
  looks: 'The first shot fills the frame; the second pops into a small rounded window in a corner.',
  use: 'A reaction over what they see, the selfie over the view, behind the scenes over the result. swap trades them mid-section.',
  clips: { min: 2, max: 2 }, beats: { min: 2, default: 8, max: 24 }, wants: ['portrait', 'people'],
  params: [
    { id: 'corner', type: 'enum', label: 'Corner', default: 'auto', options: ['auto', ...CORNERS] },
    { id: 'size', type: 'number', label: 'Window width (share of the frame)', default: 0.36, min: 0.2, max: 0.5 },
    { id: 'swap', type: 'boolean', label: 'Trade places on the middle beat', default: false },
    { id: 'border', type: 'color', label: 'Border', default: '#ffffff' },
  ],
  build: (ctx: MoveContext) => {
    const [a, b] = ctx.clips as [AssemblyClip, AssemblyClip];
    const len = ctx.end - ctx.start;
    const mid = bool(ctx.params.swap, false) && ctx.beats >= 2 ? ctx.beatFrame(Math.round(ctx.beats / 2)) : ctx.end;
    const ma = ctx.moment(a, len), mb = ctx.moment(b, len);
    const size = Math.min(0.5, Math.max(0.2, num(ctx.params.size, 0.36)));
    const halves: Array<{ main: AssemblyClip; inset: AssemblyClip; mainIn: number; insetIn: number; from: number; to: number }> = [
      { main: a, inset: b, mainIn: ma.inFrame, insetIn: mb.inFrame, from: ctx.start, to: mid },
    ];
    // after the swap each shot carries on from where it was, in the other place
    if (mid < ctx.end) halves.push({ main: b, inset: a, mainIn: mb.inFrame + (mid - ctx.start), insetIn: ma.inFrame + (mid - ctx.start), from: mid, to: ctx.end });
    halves.forEach((h, i) => {
      if (h.to - h.from < 1) return;
      const f = h.main.kind === 'video' ? focusForRange(h.main, h.mainIn, h.mainIn + (h.to - h.from)) : undefined;
      const box = pipBox(ctx.W, ctx.H, size, pipCorner(str(ctx.params.corner, 'auto'), f ? f.x + f.w / 2 : undefined));
      clipAt(ctx, 0, ['pip-main', i], h.main, h.from, h.to, h.mainIn);
      insetLayers(ctx, i, h.inset, h.from, h.to, h.insetIn, box, str(ctx.params.border, '#ffffff'));
    });
  },
};

/** The inset: a soft shadow, the border card and the shot, one transform about the box centre, popping in together. */
function insetLayers(ctx: MoveContext, i: number, clip: AssemblyClip, from: number, to: number, inFrame: number, box: PipBox, border: string) {
  const { W, H } = ctx;
  const s = box.w / W; // the inset keeps the reel's shape, so one scale fits it
  const x = ((box.x + box.w / 2) / W - 0.5) * 100, y = ((box.y + box.h / 2) / H - 0.5) * 100;
  const radius = box.w * 0.07; // on screen
  const line = Math.max(3, Math.round(W * 0.006));
  const pop = Math.max(3, Math.round(ctx.fps * 0.35));
  // keyframed opacity overrides the static one, so the shadow's own opacity is its peak here
  const popKeys = (sx: number, sy: number, peak = 1): Record<string, Keyframe[]> => {
    const k = (v: number): Keyframe[] => [{ frame: 0, value: v * 0.55, easing: 'easeOut' }, { frame: Math.round(pop * 0.65), value: v * 1.04, easing: 'easeInOut' }, { frame: pop, value: v }];
    return { scaleX: k(sx), scaleY: k(sy), opacity: [{ frame: 0, value: 0 }, { frame: Math.max(1, Math.round(pop * 0.3)), value: peak }] };
  };
  // the card is the box grown by the border line on every side: its own scale on each axis keeps the line even
  const bx = s + (2 * line) / W, by = s + (2 * line) / H;
  const card = (sx: number, sy: number, r: number, dy = 0, peak = 1) => ({ transform: { scaleX: sx, scaleY: sy, x, y: y + dy, borderRadius: r / s }, keyframes: popKeys(sx, sy, peak) });
  solid(ctx, 1, ['pip-shadow', i], 'Inset shadow', from, to, '#000000', { ...card(bx, by, radius + line, 0.4, 0.45), filters: { blur: Math.round(W * 0.018) } });
  solid(ctx, 2, ['pip-border', i], 'Inset border', from, to, border, card(bx, by, radius + line));
  clipAt(ctx, 3, ['pip-inset', i], clip, from, to, inFrame, { name: `${clip.name} (inset)`, ...card(s, s, radius) });
}

// ---- film strip --------------------------------------------------------------------------------------------------

export interface StripGeometry {
  vertical: boolean;
  /** frame length along the strip, frame size across it, distance between frames, all in px */
  frameAlong: number; frameAcross: number; pitch: number;
  /** strip size across, and where the strip and the frames start across the picture */
  stripAcross: number; stripAt: number; frameAt: number;
  /** picture size along the strip's travel */
  along: number;
}

/** A 35 mm-like strip: tall reels run it up the middle, wide ones across; the frames are 4:3 pictures. */
export function stripGeometry(W: number, H: number): StripGeometry {
  const vertical = H >= W;
  const across = vertical ? W : H;
  const frameAcross = across * (vertical ? 0.7 : 0.62);
  const frameAlong = vertical ? frameAcross * 0.75 : frameAcross * (4 / 3);
  const stripAcross = frameAcross + across * 0.15;
  return {
    vertical, frameAlong, frameAcross, pitch: frameAlong + across * 0.035,
    stripAcross, stripAt: (across - stripAcross) / 2, frameAt: (across - frameAcross) / 2, along: vertical ? H : W,
  };
}

/** The strip's travel in px at section seconds: [t, offset] keys. Scroll runs at one frame per `every` beats; step
 *  holds each frame in the middle and pulls the next one in on its beat, like a projector's gate. */
export function stripTravel(beatSec: (b: number) => number, beats: number, every: number, pitch: number, motion: 'scroll' | 'step', endSec: number): Array<[number, number]> {
  const steps = Math.max(1, Math.floor(beats / every + 1e-6));
  if (motion === 'scroll') return [[0, 0], [endSec, (endSec / Math.max(1e-3, beatSec(steps * every))) * steps * pitch]];
  const keys: Array<[number, number]> = [[0, 0]];
  for (let k = 1; k <= steps; k += 1) {
    const t = Math.min(endSec, beatSec(k * every));
    const pull = Math.min(0.35, (beatSec(k * every) - beatSec((k - 1) * every)) * 0.5);
    if (t - pull < keys.at(-1)![0]) break;
    keys.push([t - pull, (k - 1) * pitch], [t, k * pitch]);
  }
  return keys;
}

const offsetAt = (keys: Array<[number, number]>, t: number) => {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1]![0] <= t) i += 1;
  const [t0, o0] = keys[i]!, [t1, o1] = keys[Math.min(i + 1, keys.length - 1)]!;
  return t1 > t0 ? o0 + (o1 - o0) * Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : o0;
};

export const filmStrip: MoveDef = {
  id: 'film-strip', name: 'Film strip',
  looks: 'A film strip runs through the frame, a clip in each frame; the last frame grows to fill the screen.',
  use: 'Memories, a recap, a nostalgic opener. 3-8 clips.',
  clips: { min: 2, max: 10 }, beats: { min: 4, default: 8, max: 24 }, wants: ['people', 'scenery', 'detail'],
  params: [
    { id: 'every', type: 'number', label: 'Beats per frame', default: 1, min: 0.5, max: 4 },
    { id: 'motion', type: 'enum', label: 'Motion', default: 'step', options: ['step', 'scroll'] },
    { id: 'zoom', type: 'boolean', label: 'The last frame fills the screen', default: true },
    { id: 'backdrop', type: 'enum', label: 'Behind the strip', default: 'blur', options: ['blur', 'color'] },
    { id: 'background', type: 'color', label: 'Background colour', default: '#e9e2d4' },
  ],
  clipCount: (beats, p) => Math.min(8, Math.max(3, Math.floor(beats / num(p.every, 1)) + 1)),
  build: (ctx: MoveContext) => {
    const { W, H, fps } = ctx;
    const sec = (ctx.end - ctx.start) / fps;
    const beatSec = (b: number) => (ctx.beatFrame(b) - ctx.start) / fps;
    const g = stripGeometry(W, H);
    const zoom = bool(ctx.params.zoom, true);
    // the zoom takes the last beat (at most 0.8 s); the strip stops before it
    const zoomSec = zoom ? Math.min(0.8, Math.max(0.3, sec - beatSec(Math.max(0, ctx.beats - 1)))) : 0;
    const every = Math.max(0.5, num(ctx.params.every, 1));
    const travel = stripTravel(beatSec, ctx.beats - (zoom ? 1 : 0), every, g.pitch, str(ctx.params.motion, 'step') === 'scroll' ? 'scroll' : 'step', sec - zoomSec);
    const total = travel.at(-1)![1];
    // frame 0 is centred at the start; frames before and after fill the picture as the strip runs
    const centre = (g.along - g.frameAlong) / 2;
    const before = Math.ceil(centre / g.pitch) + 1;
    const lastCentred = Math.round(total / g.pitch);
    const after = lastCentred + Math.ceil(centre / g.pitch) + 1;
    const rect = (alongAt: number, acrossAt: number, alongLen: number, acrossLen: number): Rect =>
      g.vertical ? [acrossAt, alongAt, acrossLen, alongLen] : [alongAt, acrossAt, alongLen, acrossLen];
    // keys of a window riding the strip: its rect at each travel key; linear for scroll, eased pulls for step
    const linear = str(ctx.params.motion, 'step') === 'scroll';
    const ride = (alongAt: number, acrossAt: number, alongLen: number, acrossLen: number): WindowKey[] =>
      travel.map(([t, o]) => ({ t, win: rect(alongAt - o, acrossAt, alongLen, acrossLen), ...(linear ? { linear: true } : {}) }));
    // when a stretch [a, a + len) along the strip is on screen, in section seconds (sampled each frame)
    const onScreen = (a: number, len: number): [number, number] | null => {
      let lo = Infinity, hi = -Infinity;
      for (let f = 0; f <= Math.ceil(sec * fps); f += 1) {
        const p = a - offsetAt(travel, f / fps);
        if (p < g.along && p + len > 0) { lo = Math.min(lo, f / fps); hi = Math.max(hi, (f + 1) / fps); }
      }
      return hi > lo ? [lo, Math.min(sec, hi)] : null;
    };
    const sources: Record<string, GraphicSource> = {};
    const windows: GraphicWindow[] = [];
    const hole = str(ctx.params.backdrop, 'blur') === 'color' ? str(ctx.params.background, '#e9e2d4') : '#e9e2d4';
    // the strip itself: dark film the length of the picture (it is uniform, so it does not need to move)
    windows.push({ s: null, fill: '#131210', from: 0, to: sec, cover: 'window', keys: [{ t: 0, win: rect(0, g.stripAt, g.along, g.stripAcross) }] });
    let zoomWindow: GraphicWindow | undefined;
    const margin = g.frameAt - g.stripAt;
    for (let i = -before; i <= after; i += 1) {
      const at = centre + i * g.pitch;
      // sprocket holes: four a frame on each edge, from the frame's gap
      for (let k = 0; k < 4; k += 1) {
        const ha = at - (g.pitch - g.frameAlong) / 2 + (k + 0.25) * (g.pitch / 4), hl = (g.pitch / 4) * 0.5;
        const span = onScreen(ha, hl);
        if (!span) continue;
        for (const across of [g.stripAt + margin * 0.28, g.frameAt + g.frameAcross + margin * 0.28]) {
          windows.push({ s: null, fill: hole, from: span[0], to: span[1], cover: 'window', keys: ride(ha, across, hl, margin * 0.44) });
        }
      }
      const span = onScreen(at, g.frameAlong);
      if (!span && i !== lastCentred) continue;
      const clip = ctx.clips[((i % ctx.clips.length) + ctx.clips.length) % ctx.clips.length]!;
      const [from, to] = i === lastCentred && zoom ? [span?.[0] ?? sec - zoomSec, sec] : span!;
      const key = `f${i + before}`;
      sources[key] = source(ctx, clip, to - from, from);
      const keys = ride(at, g.frameAt, g.frameAlong, g.frameAcross);
      const w: GraphicWindow = { s: key, from, to, cover: 'window', keys };
      if (i === lastCentred && zoom) {
        // where the strip stops it grows to the full picture (the picture covers the growing window, so it zooms)
        w.keys = [...keys.slice(0, -1), { ...keys.at(-1)!, linear: false }, { t: sec, win: [0, 0, W, H] }];
        zoomWindow = w;
      } else windows.push(w);
    }
    if (zoomWindow) windows.push(zoomWindow); // drawn last, over the strip
    if (str(ctx.params.backdrop, 'blur') === 'color') solid(ctx, 0, ['strip-bg'], 'Background', ctx.start, ctx.end, str(ctx.params.background, '#e9e2d4'));
    else {
      // a soft, dark copy of the first clip behind the strip
      const first = ctx.clips[0]!;
      clipAt(ctx, 0, ['strip-bg'], first, ctx.start, ctx.end, ctx.moment(first, ctx.end - ctx.start).inFrame, {
        name: `${first.name} (behind the strip)`, transform: { scale: 1.12 }, filters: { blur: Math.round(W * 0.03), brightness: 0.55, saturate: 0.8 },
      });
    }
    graphic(ctx, 1, ['film-strip'], 'Film strip', ctx.start, ctx.end, sources, windows);
  },
};
