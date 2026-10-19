import assert from 'node:assert/strict';
import { matchTransform, velocityRate } from './creatorMoves';

// velocity: starts at normal speed, races to fast before the slam, slow from the slam, fast again at the end
assert.equal(velocityRate(0, 8, 3, 0.3, 2.8), 1);
assert.ok(velocityRate(2.9, 8, 3, 0.3, 2.8) > 2.5);
assert.equal(velocityRate(3, 8, 3, 0.3, 2.8), 0.3);
assert.equal(velocityRate(5, 8, 3, 0.3, 2.8), 0.3);
assert.ok(velocityRate(7.99, 8, 3, 0.3, 2.8) > 2.7);

// match cut: the person's box lands at the same place and height whatever the source shape, and the frame stays covered
const W = 1080, H = 1920;
const place = (clip: { width: number; height: number }, focus: { x: number; y: number; w: number; h: number }) => {
  const t = matchTransform(clip, W, H, focus, 0.6)!;
  const cs = Math.min(W / clip.width, H / clip.height);
  const pw = clip.width * cs * t.scale, ph = clip.height * cs * t.scale;
  const cx = W / 2 + (focus.x + focus.w / 2 - 0.5) * pw + (t.x / 100) * W;
  const cy = H / 2 + (focus.y + focus.h / 2 - 0.5) * ph + (t.y / 100) * H;
  return { t, cx: cx / W, cy: cy / H, h: (focus.h * ph) / H, covers: pw >= W - 1 && ph >= H - 1 };
};
const portrait = place({ width: 1080, height: 1920 }, { x: 0.3, y: 0.25, w: 0.3, h: 0.5 });
const landscape = place({ width: 1920, height: 1080 }, { x: 0.4, y: 0.25, w: 0.1, h: 0.5 });
for (const p of [portrait, landscape]) {
  assert.ok(Math.abs(p.cx - 0.5) < 0.01 && Math.abs(p.cy - 0.55) < 0.01, `centred: ${p.cx}, ${p.cy}`);
  assert.ok(Math.abs(p.h - 0.6) < 0.01, `height ${p.h}`);
  assert.ok(p.covers);
}
// a person at the very edge is pulled in as far as the frame allows, never leaving a gap
const edge = place({ width: 1080, height: 1920 }, { x: 0.0, y: 0.0, w: 0.2, h: 0.3 });
assert.ok(edge.covers && Math.abs(edge.t.x) <= ((edge.t.scale - 1) / 2) * 100 + 1e-6);
assert.equal(matchTransform({ width: 1080, height: 1920 }, W, H, undefined, 0.6), null);
console.log('creatorMoves: ok');
