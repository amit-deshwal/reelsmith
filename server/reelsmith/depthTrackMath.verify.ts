// RS-1260: a depth track holds still where the scene does. Synthetic model output: a far-to-near ground ramp and a person
// who walks in from the side, each frame with its own unknown scale and offset (as the model gives) and a little noise.
import assert from 'node:assert/strict';
import { fitScaleOffset, stabiliseTrack, type RawFrame } from './depthTrackMath.ts';

const W = 64, H = 96, N = 17;
let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const truth = (k: number) => {
  const d = new Float32Array(W * H);
  const px = Math.round(-10 + (k / (N - 1)) * 40); // the person's left edge, entering from the left
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ground = 0.05 + 0.6 * (y / H) ** 2;
    d[y * W + x] = x >= px && x < px + 16 && y > 30 ? 0.9 : ground;
  }
  return { d, px };
};
const frames: RawFrame[] = [];
const truths: Array<{ d: Float32Array; px: number }> = [];
for (let k = 0; k < N; k++) {
  const t = truth(k);
  truths.push(t);
  const a = 3 + rand() * 4, b = rand() * 2 - 1; // each frame's own scale and offset
  frames.push({ depth: Float32Array.from(t.d, (v) => a * (v + (rand() - 0.5) * 0.01) + b), width: W, height: H });
}

// least squares with the worst fits dropped recovers a scale and offset despite a moving part
const x = Float32Array.from({ length: 400 }, (_, i) => (i % 20) / 20);
const y = Float32Array.from(x, (v, i) => (i < 60 ? 5 : 2 * v + 0.3));
const fit = fitScaleOffset(x, y, 0.2, 1);
assert.ok(Math.abs(fit.a - 2) < 0.02 && Math.abs(fit.b - 0.3) < 0.02, JSON.stringify(fit));

const steady = stabiliseTrack(frames);
assert.equal(steady.length, N);
// the still background (left of where the person starts, right of where they end, and the sky rows) between frames
const still = (i: number) => { const xx = i % W, yy = Math.floor(i / W); return yy <= 30 || xx >= 50; };
let worst = 0;
for (let k = 1; k < N; k++) {
  let s = 0, n = 0;
  for (let i = 0; i < W * H; i++) if (still(i)) { s += Math.abs(steady[k]![i]! - steady[k - 1]![i]!); n++; }
  worst = Math.max(worst, s / n);
}
assert.ok(worst < 0.02, `a still background changes under 2% a frame (${(worst * 100).toFixed(2)}%)`);
// each frame on its own range would breathe as the person comes in (the comparison)
const own = frames.map((f) => { const s = Float32Array.from(f.depth).sort(); const lo = s[Math.floor(s.length * 0.02)]!, hi = s[Math.floor(s.length * 0.98)]!; return Float32Array.from(f.depth, (v) => (v - lo) / (hi - lo)); });
// the person stays where they are in each frame (no ghost left behind, none ahead): near inside, far beside
for (const k of [4, 8, 12]) {
  const { px } = truths[k]!;
  const at = (xx: number, yy: number) => steady[k]![yy * W + xx]!;
  assert.ok(at(px + 8, 60) > 0.8, `frame ${k}: the person is near (${at(px + 8, 60).toFixed(2)})`);
  assert.ok(at(px - 3, 50) < at(px + 8, 60) - 0.4 && at(px + 19, 50) < at(px + 8, 60) - 0.4, `frame ${k}: no ghost beside them`);
}
let ownWorst = 0;
for (let k = 1; k < N; k++) {
  let s = 0, n = 0;
  for (let i = 0; i < W * H; i++) if (still(i)) { s += Math.abs(own[k]![i]! - own[k - 1]![i]!); n++; }
  ownWorst = Math.max(ownWorst, s / n);
}
assert.ok(worst < ownWorst / 3, `steadier than each frame on its own range (${(worst * 100).toFixed(2)}% vs ${(ownWorst * 100).toFixed(2)}%)`);
console.log(`depthTrackMath.verify: ok (worst still-background change ${(worst * 100).toFixed(2)}% a frame; ${(ownWorst * 100).toFixed(2)}% framewise)`);
