// RS-408..410: registry, uniforms vs the shader source, default length, undo, and the shader maths mirrored on the CPU.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { activeTimeline, BREAK_IN_SECONDS, GLSL_TRANSITION_TYPES, TRANSITION_ORDER } from '../editor/types';
import { GLSL_TRANSITIONS, WINDOW_LIMIT } from '../gl/transitions';
import { safeRect } from './safeZone';

const shader = (name: string) => readFileSync(new URL(`../gl/shaders/${name}.frag`, import.meta.url), 'utf8');
const declared = (src: string) => [...src.matchAll(/^uniform\s+\w+\s+(u_\w+)/gm)].map((m) => m[1]!);

for (const type of ['bars', 'wide-bars', 'window'] as const) {
  assert.ok(GLSL_TRANSITION_TYPES.has(type) && TRANSITION_ORDER.includes(type), `${type} registered`);
  const def = GLSL_TRANSITIONS[type];
  const src = def.frag === GLSL_TRANSITIONS.bars.frag ? shader('bars') : shader('window');
  const names = declared(src).filter((n) => !['u_outgoing', 'u_incoming', 'u_progress'].includes(n));
  for (const dir of ['left', 'right', 'up', 'down'] as const) {
    const u = def.uniforms({ time: 0, aspect: 9 / 16, direction: dir });
    assert.deepEqual(Object.keys(u).sort(), names.sort(), `${type}/${dir}: every declared uniform is set, none extra`);
  }
}
assert.equal(GLSL_TRANSITIONS['wide-bars'].frag, GLSL_TRANSITIONS.bars.frag, 'wide bars reuse the bars shader');
const u = (t: 'bars' | 'wide-bars', d: 'left' | 'right' | 'up' | 'down') => GLSL_TRANSITIONS[t].uniforms({ time: 0, aspect: 1, direction: d });
assert.equal(u('bars', 'left').u_count, 6);
assert.equal(u('wide-bars', 'left').u_count, 3);
assert.equal(u('wide-bars', 'left').u_horizontal, 1, 'horizontal variant by default');
assert.equal(u('wide-bars', 'up').u_horizontal, 0, 'vertical variant');

// default length 0.35 s, one undo
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
for (const [id, start] of [['a', 0], ['b', 90]] as const) {
  h = historyReduce(h, { type: 'add', startFrame: start, item: { id, track: 'V1', kind: 'video', name: id, src: `/${id}.mp4`, durationInFrames: 90 } } as never);
}
const before = h.past.length;
h = historyReduce(h, { type: 'addTransition', id: 't', incomingItemId: 'b', transType: 'bars' } as never);
const tr = () => activeTimeline(h.present).transitions ?? [];
assert.equal(h.past.length, before + 1, 'one undo step');
assert.equal(tr()[0]?.type, 'bars');
assert.equal(tr()[0]?.durationInFrames, Math.round(BREAK_IN_SECONDS * activeTimeline(h.present).fps), 'default 0.35 s');
h = historyReduce(h, { type: 'undo' } as never);
assert.equal(tr().length, 0, 'undo removes it');

// ---- CPU mirror of bars.frag: which picture shows at (along, slide) ----
const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
function barsShows(p: number, x: number, y: number, o: { count: number; stagger: number; dir: number; horizontal: boolean }): 'out' | 'in' {
  const along = o.horizontal ? y : x, slide = o.horizontal ? x : y;
  const i = Math.min(Math.floor(along * o.count), o.count - 1);
  const s = Math.min(0.9, o.stagger);
  const delay = o.count > 1 ? (s * i) / (o.count - 1) : 0;
  const e = smooth((p - delay) / (1 - s));
  const dir = o.dir === 0 ? (i % 2 === 0 ? 1 : -1) : o.dir;
  const s2 = slide + dir * (1 - e);
  return s2 >= 0 && s2 <= 1 ? 'in' : 'out';
}
for (const o of [{ count: 6, stagger: 0.5, dir: 0, horizontal: false }, { count: 3, stagger: 0.4, dir: 0, horizontal: true }, { count: 8, stagger: 0.2, dir: 1, horizontal: false }]) {
  let inAt0 = 0, inAtHalf = 0, inAt1 = 0, n = 0;
  for (let a = 0.02; a < 1; a += 0.04) for (let b = 0.02; b < 1; b += 0.04) {
    n += 1;
    if (barsShows(0, a, b, o) === 'in') inAt0 += 1;
    if (barsShows(0.5, a, b, o) === 'in') inAtHalf += 1;
    if (barsShows(1, a, b, o) === 'in') inAt1 += 1;
  }
  assert.equal(inAt0, 0, 'progress 0: all outgoing');
  assert.equal(inAt1, n, 'progress 1: all incoming, no seams');
  assert.ok(inAtHalf > n * 0.1 && inAtHalf < n * 0.9, `progress 0.5: a half-open pattern (${inAtHalf}/${n})`);
}

// ---- CPU mirror of window.frag: the rectangle at progress p ----
function windowHalf(p: number, start: number, limit: [number, number], centre: [number, number]): [number, number] {
  const full: [number, number] = [Math.max(centre[0], 1 - centre[0]) + 0.05, Math.max(centre[1], 1 - centre[1]) + 0.05];
  const q = smooth(p / 0.8), r = smooth((p - 0.8) / 0.2);
  return [0, 1].map((k) => {
    const h1 = start * limit[k]! + (limit[k]! - start * limit[k]!) * q;
    return h1 + (full[k]! - h1) * r;
  }) as [number, number];
}
const start = GLSL_TRANSITIONS.window.uniforms({ time: 0, aspect: 9 / 16, direction: 'left' }).u_start as number;
const [sx, sy] = windowHalf(0, start, WINDOW_LIMIT, [0.5, 0.5]);
assert.ok(sx < 0.2 && sy < 0.2, 'starts as a small window');
const [fx, fy] = windowHalf(1, start, WINDOW_LIMIT, [0.5, 0.5]);
assert.ok(fx >= 0.5 && fy >= 0.5, 'progress 1 covers the whole frame: no outgoing leakage');
const W = 1080, H = 1920;
const safe = safeRect({ width: W, height: H });
for (let p = 0; p <= 0.8 + 1e-9; p += 0.02) {
  const [hx, hy] = windowHalf(p, start, WINDOW_LIMIT, [0.5, 0.5]);
  const left = (0.5 - hx) * W, right = (0.5 + hx) * W, top = (0.5 - hy) * H, bottom = (0.5 + hy) * H;
  assert.ok(left >= safe.x - 1e-6 && right <= safe.x + safe.w + 1e-6 && top >= safe.y - 1e-6 && bottom <= safe.y + safe.h + 1e-6, `window inside the safe zone at p=${p.toFixed(2)}`);
}

// RS-410 props: overrides apply, are clamped, and the centre stays where the 80% window clears the safe zone.
import { windowCentreYRange, windowUniforms } from './windowProps';
const canvas = { width: W, height: H };
const base = GLSL_TRANSITIONS.window.uniforms({ time: 0, aspect: 9 / 16, direction: 'left' });
const d = windowUniforms(base, undefined, canvas);
assert.equal(d.u_start, 0.3); assert.deepEqual(d.u_center, [0.5, 0.5]);
const o = windowUniforms(base, { u_start: 5, u_radius: -1, u_shadow: 0.2, u_cy: 0 }, canvas);
assert.equal(o.u_start, 1); assert.equal(o.u_radius, 0); assert.equal(o.u_shadow, 0.2);
const [lo, hi] = windowCentreYRange(canvas);
assert.equal((o.u_center as number[])[1], lo);
assert.ok((lo - WINDOW_LIMIT[1]) * H >= safe.y - 1e-6 && (hi + WINDOW_LIMIT[1]) * H <= safe.y + safe.h + 1e-6, 'centre range keeps the window in the safe zone');
console.log('breakIn.verify ok');
