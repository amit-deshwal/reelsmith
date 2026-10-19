// Creator moves (RS-1208): the signature edits of the paid phone editors, as director moves. A velocity edit (fast, slam
// into slow motion on the beat, fast again), a 3D zoom (the person pushes in while the background pulls back), a
// freeze-frame intro, a match cut (the person in the same spot and size across outfits or places) and a talking shot
// with jump zooms on the phrases. Items carry props.rsAccent where a sound belongs; the compiler turns them into sound.
import type { AssemblyClip } from '../assembler/types';
import type { FocusRect } from '../cropFocus';
import { focusForRange } from '../titleClear';
import { bool, clipAt, num, solid, type MoveContext, type MoveDef } from './moveKit';

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** A white flash of a few frames, marked so the compiler puts a sound on it. */
function flash(ctx: MoveContext, key: string, at: number, accent: string, opacity = 0.75): void {
  const len = Math.max(2, Math.round(ctx.fps * 0.1));
  if (at + 1 >= ctx.end) return;
  solid(ctx, 2, [key], 'Flash', at, Math.min(ctx.end, at + len), '#ffffff', { transform: { opacity }, fadeOutFrames: len, props: { rsAccent: accent } });
}

/** Speed at beat b of a velocity section: ease up to fast, slam to slow on the hit, hold, ease up to fast again. */
export function velocityRate(b: number, beats: number, hit: number, slow: number, fast: number): number {
  const resume = hit + Math.max(1, (beats - hit) * 0.5);
  if (b < hit) return 1 + (fast - 1) * smooth(b / Math.max(0.5, hit));
  if (b < resume) return slow;
  return slow + (fast - slow) * smooth((b - resume) / Math.max(0.5, beats - resume));
}

const velocity: MoveDef = {
  id: 'velocity', name: 'Velocity edit', looks: 'One shot races faster and faster, slams into slow motion on the beat with a flash, holds the moment, then whips fast again; motion blur on the fast parts.',
  use: 'The signature creator edit for the single best action shot: a jump, a run, a spin, a dive, a hair flip. Needs a video about twice the section length; one clip. Once per reel.',
  clips: { min: 1, max: 1 }, beats: { min: 4, default: 8, max: 16 }, wants: ['action', 'people'],
  params: [
    { id: 'slow', type: 'number', label: 'Slow-motion speed', default: 0.3, min: 0.15, max: 0.7 },
    { id: 'fast', type: 'number', label: 'Fast speed', default: 2.8, min: 1.5, max: 4 },
    { id: 'hit', type: 'number', label: 'Beat of the slam (0 = automatic)', default: 0, min: 0, max: 15 },
  ],
  build: (ctx) => {
    const clip = ctx.clips[0]!;
    if (clip.kind !== 'video') { ctx.warn(`${clip.name} is a photo; a velocity edit needs video, so it is held instead.`); clipAt(ctx, 0, ['vel'], clip, ctx.start, ctx.end, 0); return; }
    const B = ctx.beats;
    const hit = num(ctx.params.hit, 0) >= 1 ? Math.min(B - 1, num(ctx.params.hit, 0)) : Math.max(1, Math.round(B * 0.4));
    const slow = num(ctx.params.slow, 0.3), fast = num(ctx.params.fast, 2.8);
    // slices of about a tenth of a second, merged while the speed barely changes; the slam is its own cut
    const step = Math.max(2, Math.round(ctx.fps * 0.1));
    const beatAt = (f: number) => ((f - ctx.start) / Math.max(1, ctx.end - ctx.start)) * B;
    const hitFrame = ctx.beatFrame(hit);
    const parts: Array<{ from: number; to: number; rate: number }> = [];
    for (let f = ctx.start; f < ctx.end;) {
      const to = Math.min(ctx.end, f + step, f < hitFrame ? hitFrame : ctx.end);
      const rate = velocityRate(beatAt((f + to) / 2), B, hit, slow, fast);
      const last = parts.at(-1);
      if (last && Math.abs(last.rate - rate) < 0.08 && !(last.to === hitFrame)) { last.to = to; last.rate = (last.rate + rate) / 2; } else parts.push({ from: f, to, rate });
      f = to;
    }
    let need = parts.reduce((s, p) => s + (p.to - p.from) * p.rate, 0);
    let k = 1;
    if (need > clip.durationInFrames - 2) { k = (clip.durationInFrames - 2) / need; ctx.warn(`${clip.name} is short for this velocity edit; the fast parts are slower.`); need = clip.durationInFrames - 2; }
    let src = ctx.moment(clip, Math.round(need)).inFrame;
    parts.forEach((p, i) => {
      const rate = Math.round(Math.max(0.1, p.rate * k) * 1000) / 1000;
      const blur = rate >= 1.6 ? [{ id: ctx.id('vel-blur', i), assetId: 'builtin:fx-motion-blur', overrides: { amount: Math.min(10, (rate - 1) * 2.4) } }] : [];
      clipAt(ctx, 0, ['vel', i], clip, p.from, p.to, Math.min(Math.round(src), clip.durationInFrames - 2), {
        ...(rate !== 1 ? { playbackRate: rate } : {}), ...(blur.length ? { effects: blur } : {}),
        ...(p.from === parts.find((x) => x.from >= hitFrame && x.rate >= slow + 0.3)?.from ? { props: { rsAccent: 'whoosh-heavy' } } : {}),
      });
      src += (p.to - p.from) * rate;
    });
    flash(ctx, 'vel-flash', hitFrame, 'hit');
  },
};

const photo3d: MoveDef = {
  id: 'photo-3d', name: '3D zoom', looks: 'Each photo comes alive: the person pushes toward the camera while the background pulls away behind them, like a 3D photo.',
  use: 'Photos (or steady shots) with one clear person in front of a background: portraits, "me at the viewpoint", group photos for an intro. One clip per 2-4 beats.',
  clips: { min: 1, max: 6 }, beats: { min: 2, default: 8, max: 24 }, wants: ['people', 'portrait', 'posing'],
  params: [{ id: 'depth', type: 'number', label: 'Depth (how far the person comes out)', default: 0.14, min: 0.04, max: 0.3 }],
  clipCount: (beats) => Math.min(6, Math.max(1, Math.round(beats / 4))),
  build: (ctx) => {
    const depth = num(ctx.params.depth, 0.14);
    const n = ctx.clips.length;
    const per = ctx.beats / n;
    ctx.clips.forEach((clip, i) => {
      const from = ctx.beatFrame(i * per);
      const to = i === n - 1 ? ctx.end : ctx.beatFrame((i + 1) * per);
      if (to - from < 2) return;
      const len = to - from;
      const inFrame = ctx.moment(clip, len).inFrame;
      // the background pulls back from a little zoomed in; a copy cut out to the person pushes in over it
      clipAt(ctx, 0, ['p3d', i], clip, from, to, inFrame, { keyframes: { scale: [{ frame: 0, value: 1 + depth * 0.7, easing: 'easeOut' }, { frame: len - 1, value: 1 }] } });
      clipAt(ctx, 1, ['p3d-front', i], clip, from, to, inFrame, {
        name: `${clip.name} (3D front)`, keyframes: { scale: [{ frame: 0, value: 1, easing: 'easeOut' }, { frame: len - 1, value: 1 + depth }] }, props: { rsFront: true },
      });
    });
  },
};

const freezeIntro: MoveDef = {
  id: 'freeze-intro', name: 'Freeze-frame intro', looks: 'The shot plays, then freezes on the beat with a camera-shutter flash; the world goes grey and dim while the person stays in colour with a glow, and the picture eases in.',
  use: 'Introducing someone: "this is Rahul", yourself at the start, a squad intro (one section per person). One video with one clear person; put their name as the section text (location-tag, pop-words, big-title or follow-tag).',
  clips: { min: 1, max: 1 }, beats: { min: 2, default: 4, max: 12 }, wants: ['people', 'portrait', 'posing'],
  params: [{ id: 'at', type: 'number', label: 'Beats before it freezes', default: 1, min: 0.5, max: 4 }],
  build: (ctx) => {
    const clip = ctx.clips[0]!;
    const playB = Math.min(num(ctx.params.at, 1), ctx.beats - 0.5);
    const f1 = ctx.beatFrame(playB);
    const m = ctx.moment(clip, f1 - ctx.start + 2);
    if (f1 > ctx.start) clipAt(ctx, 0, ['fz-play'], clip, ctx.start, f1, m.inFrame);
    const frozen = Math.max(0, Math.min(clip.durationInFrames - 1, m.inFrame + (f1 - ctx.start)));
    const len = ctx.end - f1;
    // a near-zero speed holds the frame (the editor has no still-from-video); the subject-pop look does the rest
    clipAt(ctx, 0, ['fz-hold'], clip, f1, ctx.end, frozen, {
      ...(clip.kind === 'video' ? { playbackRate: 0.02 } : {}),
      keyframes: { scale: [{ frame: 0, value: 1, easing: 'easeOut' }, { frame: Math.min(len - 1, Math.round(ctx.fps * 0.4)), value: 1.07 }] },
      effects: [{ id: ctx.id('fz-pop'), assetId: 'builtin:fx-subject-pop', overrides: {} }],
    });
    flash(ctx, 'fz-flash', f1, 'shutter', 0.9);
  },
};

/** A cover transform that puts the person's box at the same place and height in every shot (null without a focus). */
export function matchTransform(clip: Pick<AssemblyClip, 'width' | 'height'>, W: number, H: number, focus: FocusRect | undefined, height: number, centerY = 0.55) {
  const w = clip.width ?? 0, h = clip.height ?? 0;
  if (!focus || !(w > 0 && h > 0) || !(focus.h > 0)) return null;
  const cs = Math.min(W / w, H / h);
  const cover = Math.max(W / (w * cs), H / (h * cs));
  const S = Math.min(4, Math.max(cover, (height * H) / (focus.h * h * cs)));
  const pw = w * cs * S, ph = h * cs * S;
  const fx = focus.x + focus.w / 2, fy = focus.y + focus.h / 2;
  const clampPct = (v: number, room: number) => Math.max(-room, Math.min(room, v));
  const x = clampPct((-(fx - 0.5) * pw / W) * 100, ((pw - W) / 2 / W) * 100);
  const y = clampPct((((centerY - 0.5) * H - (fy - 0.5) * ph) / H) * 100, ((ph - H) / 2 / H) * 100);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { scale: r(S), scaleX: r(S), scaleY: r(S), x: r(x), y: r(y) };
}

const matchCut: MoveDef = {
  id: 'match-cut', name: 'Match cut', looks: 'Cuts on the beat between shots of the person, lined up so they stand in the same spot at the same size every time while the outfit or the place changes around them.',
  use: 'Outfit changes, the same pose in different places, "me in every city", a transformation. 3-8 clips of the same person framed alike (full body or half body).',
  clips: { min: 2, max: 12 }, beats: { min: 2, default: 8, max: 16 }, wants: ['people', 'posing', 'portrait'],
  params: [
    { id: 'every', type: 'number', label: 'Beats per shot', default: 1, min: 0.25, max: 4 },
    { id: 'size', type: 'number', label: 'Person height (share of the frame)', default: 0.6, min: 0.25, max: 0.95 },
    { id: 'flash', type: 'boolean', label: 'Soft flash on each cut', default: false },
  ],
  clipCount: (beats, p) => Math.min(12, Math.max(2, Math.ceil(beats / num(p.every, 1) - 1e-6))),
  build: (ctx) => {
    const every = num(ctx.params.every, 1);
    const size = num(ctx.params.size, 0.6);
    const cuts = Array.from({ length: Math.max(1, Math.ceil(ctx.beats / every - 1e-6)) }, (_, i) => i * every);
    let unmatched = 0;
    cuts.forEach((b, i) => {
      const clip = ctx.clips[i % ctx.clips.length]!;
      const from = ctx.beatFrame(b);
      const to = i === cuts.length - 1 ? ctx.end : ctx.beatFrame(cuts[i + 1]!);
      if (to - from < 1) return;
      const inFrame = ctx.moment(clip, to - from).inFrame;
      const t = matchTransform(clip, ctx.W, ctx.H, focusForRange(clip, inFrame, inFrame + (to - from)), size);
      if (!t) unmatched += 1;
      clipAt(ctx, 0, ['match', i], clip, from, to, inFrame, t ? { transform: t } : {});
      if (i > 0 && bool(ctx.params.flash, false)) flash(ctx, `match-flash-${i}`, from, 'shutter', 0.4);
    });
    if (unmatched) ctx.warn(`${unmatched} shot(s) have no person found by the analysis, so they are framed as usual.`);
  },
};

const talkZoom: MoveDef = {
  id: 'talk-zoom', name: 'Talking jump zooms', looks: 'One talking shot that jumps between a normal and a closer framing on each new phrase (or every two beats), like auto-zoom caption apps.',
  use: 'A piece to camera: you explaining, a reaction, a vlog line. One video where someone talks; its words set the zooms when the clip has a transcript.',
  clips: { min: 1, max: 1 }, beats: { min: 4, default: 8, max: 32 }, wants: ['people', 'portrait'],
  params: [{ id: 'zoom', type: 'number', label: 'Closer framing', default: 1.18, min: 1.05, max: 1.6 }],
  build: (ctx) => {
    const clip = ctx.clips[0]!;
    const len = ctx.end - ctx.start;
    const inFrame = ctx.moment(clip, len).inFrame;
    // phrase starts: words after a pause of 0.35 s or more, inside the part that plays
    const words = clip.transcript ?? [];
    const toFrame = (ms: number) => ctx.start + Math.round((ms / 1000) * ctx.fps) - inFrame;
    let cuts = words.filter((w, i) => i > 0 && w.start - words[i - 1]!.end >= 350).map((w) => toFrame(w.start)).filter((f) => f > ctx.start + ctx.fps * 0.6 && f < ctx.end - ctx.fps * 0.6);
    if (!cuts.length) cuts = Array.from({ length: Math.floor(ctx.beats / 2) }, (_, i) => ctx.beatFrame((i + 1) * 2)).filter((f) => f < ctx.end - ctx.fps * 0.4);
    const edges = [ctx.start, ...cuts, ctx.end];
    const zoom = num(ctx.params.zoom, 1.18);
    for (let i = 0; i < edges.length - 1; i += 1) {
      const from = edges[i]!, to = edges[i + 1]!;
      if (to - from < 2) continue;
      clipAt(ctx, 0, ['talk', i], clip, from, to, inFrame + (from - ctx.start), {
        volume: 1, // the talking is the point: this clip keeps its sound
        keyframes: { scale: [{ frame: 0, value: i % 2 ? zoom : 1 }, { frame: to - from - 1, value: i % 2 ? zoom : 1 }] },
      });
    }
  },
};

export const CREATOR_MOVES: readonly MoveDef[] = [velocity, photo3d, freezeIntro, matchCut, talkZoom];
