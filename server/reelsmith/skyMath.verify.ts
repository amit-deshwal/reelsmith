// RS-1261: the sky from depth and colour. A synthetic frame: a pale blue sky with a grey cloud, a far green ridge (nearly as
// far as the sky), a near hill, a person in a grey shirt standing against the sky and a bird. The sky is found, the ridge,
// hill and person are not, the bird is filled in; a frame with no sky gives none.
import assert from 'node:assert/strict';
import { boxBlur, MIN_SKY_SHARE, skyFromDepth } from './skyMath.ts';

const w = 120, h = 200;
const depth = new Uint8Array(w * h), rgb = new Uint8Array(w * h * 3);
const truth = new Uint8Array(w * h); // 1 = sky
const set = (x: number, y: number, d: number, c: [number, number, number], sky: boolean) => {
  const p = y * w + x;
  depth[p] = d; rgb.set(c, p * 3); truth[p] = sky ? 1 : 0;
};
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const ridge = 90 + Math.round(8 * Math.sin(x / 9));
  if (y < ridge) {
    // sky: lighter toward the horizon, a darker grey cloud, sensor noise
    const n = ((x * 7 + y * 13) % 5) - 2;
    const cloud = (x - 70) ** 2 / 300 + (y - 30) ** 2 / 60 < 1;
    const l = 175 + Math.round(y * 0.4) + n;
    set(x, y, 2 + (n & 1), cloud ? [l - 40, l - 38, l - 34] : [l - 25, l - 10, l + 20], true);
  } else if (y < 120) set(x, y, 10, [70, 110, 60], false); // far ridge, nearly as far as the sky
  else set(x, y, 60 + Math.round((y - 120) * 2), [60, 140, 50], false); // near hill
}
// a person in a grey shirt and dark hair against the sky
for (let y = 50; y < h; y++) for (let x = 20; x < 40; x++) set(x, y, 200, y < 62 ? [40, 30, 25] : [150, 152, 158], false);
// a bird (dark speck) in the sky
for (let y = 20; y < 23; y++) for (let x = 100; x < 104; x++) set(x, y, 3, [30, 30, 35], true);

const { mask, share } = skyFromDepth(depth, rgb, w, h, { blur: 0 });
let skyHit = 0, skyAll = 0, landHit = 0, landAll = 0;
for (let p = 0; p < w * h; p++) {
  if (truth[p]) { skyAll++; if (mask[p]! > 127) skyHit++; } else { landAll++; if (mask[p]! > 127) landHit++; }
}
assert.ok(skyHit / skyAll >= 0.95, `covers ${(100 * skyHit / skyAll).toFixed(1)}% of the sky`);
assert.ok(landHit / landAll < 0.02, `covers ${(100 * landHit / landAll).toFixed(1)}% of the land and the person`);
assert.ok(Math.abs(share - skyAll / (w * h)) < 0.05);
// the grey shirt is not sky, though grey like the cloud: it is near
for (let y = 70; y < 80; y++) assert.equal(mask[y * w + 30], 0, 'the person against the sky');
assert.equal(mask[21 * w + 101], 255, 'a bird in the sky is filled in');

// no sky: a wall filling the frame (near everywhere)
const wall = skyFromDepth(new Uint8Array(w * h).fill(180), new Uint8Array(w * h * 3).fill(200), w, h);
assert.equal(wall.share, 0);
assert.ok(MIN_SKY_SHARE > 0);
// a night sky (dark) is left alone
const night = skyFromDepth(new Uint8Array(w * h), new Uint8Array(w * h * 3).fill(15), w, h);
assert.equal(night.share, 0, 'a dark frame has no sky to grade');
// the outline is softened
const soft = skyFromDepth(depth, rgb, w, h, { blur: 3 }).mask;
const edgeY = 90 + Math.round(8 * Math.sin(60 / 9));
assert.ok(soft[(edgeY - 1) * w + 60]! > 0 && soft[(edgeY - 1) * w + 60]! < 255, 'a soft edge at the ridge');
// boxBlur keeps a flat image flat
assert.deepEqual([...boxBlur(new Uint8Array(16).fill(90), 4, 4, 1)], new Array(16).fill(90));
// the model and gate for finding the sky again in other frames: the sky's own colour (pale blue), and a gate a little wider
const full = skyFromDepth(depth, rgb, w, h);
assert.ok(full.model && full.model.chroma[0] < 1 / 3 && full.model.paleFloor > full.model.lumaFloor, JSON.stringify(full.model));
let wider = 0;
for (let p = 0; p < w * h; p++) { assert.ok(full.gate[p]! >= full.mask[p]! - 40); if (full.gate[p]! > 127 && full.mask[p]! < 127) wider++; }
assert.ok(wider > 0, 'the gate reaches past the sky');
assert.equal(wall.model, null);
// a top band of far, bright leaves (a pan past trees) is not a sky, though far and light
{
  const leafDepth = new Uint8Array(w * h).fill(2), leaves = new Uint8Array(w * h * 3);
  for (let p = 0; p < w * h; p++) leaves.set([110 + (p % 7), 170, 90], p * 3);
  assert.equal(skyFromDepth(leafDepth, leaves, w, h).share, 0, 'green leaves are not sky');
}
console.log('skyMath: ok');
