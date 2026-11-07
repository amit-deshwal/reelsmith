// RS-1261: the sky from depth and colour. A synthetic frame: a pale blue sky with a grey cloud, a far green ridge (nearly as
// far as the sky), a near hill, a person in a grey shirt standing against the sky and a bird. The sky is found, the ridge,
// hill and person are not, the bird is filled in; a frame with no sky gives none. Then: a ceiling is not a sky, a busy
// town as pale as haze is not, and a photo's gate is its sky. The rule on real frames: sky-eval.mts.
import assert from 'node:assert/strict';
import { boxBlur, localDeviation, MIN_SKY_SHARE, skyFromDepth } from './skyMath.ts';

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
// A photo's gate is its sky (gateReach 0): nothing beside the sky is found again by its colour.
{
  const photo = skyFromDepth(depth, rgb, w, h, { gateReach: 0 });
  assert.deepEqual([...photo.gate], [...photo.mask]);
}
// Indoors: a pale ceiling along the top, the farthest thing in the room but not at infinity. The map is stretched so its
// farthest 2% sit at 0 (a doorway, low down); the ceiling rises from 3 to 9 off it. A sky, found the same way, lies flat
// on the far end.
{
  const d = new Uint8Array(w * h), c = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (y < 80) { d[p] = 3 + Math.round((x / w) * 6); c.set([222, 220, 214], p * 3); } // ceiling
    else { d[p] = 120; c.set([120, 90, 60], p * 3); } // walls and floor
  }
  for (let y = 150; y < 170; y++) for (let x = 50; x < 70; x++) d[y * w + x] = 0; // the doorway: the map's far end
  assert.equal(skyFromDepth(d, c, w, h).share, 0, 'a ceiling is not a sky');
  // the same picture with the top at infinity is a sky
  for (let p = 0; p < w * 80; p++) d[p] = 0;
  assert.ok(skyFromDepth(d, c, w, h).share > 0.3, 'the same top, flat at the far end, is a sky');
}
// Haze below the sky is taken; a town as far and as pale but busy is not.
{
  const make = (busy: boolean) => {
    const d = new Uint8Array(w * h), c = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (y < 80) { d[p] = 0; c.set([150, 160, 185], p * 3); } // sky
      // haze fades in from the sky over a dozen rows, as it does; the town is as pale on average but busy
      else if (y < 110) {
        d[p] = 1;
        const k = Math.min(1, (y - 80) / 12), v = busy ? ((x >> 1) + (y >> 1)) % 2 ? 215 : 165 : 190;
        c.set([150 + (v - 150) * k, 160 + (v + 2 - 160) * k, 185 + (v + 10 - 185) * k].map(Math.round), p * 3);
      }
      else { d[p] = 150; c.set([60, 120, 50], p * 3); } // near hill
    }
    return { d, c };
  };
  const band = (m: Uint8Array) => { let k = 0; for (let y = 85; y < 105; y++) for (let x = 0; x < w; x++) if (m[y * w + x]! > 127) k++; return k / (20 * w); };
  const haze = make(false), town = make(true);
  assert.ok(localDeviation(town.c, w, h, 2)[100 * w + 60]! > 0.02 && localDeviation(haze.c, w, h, 2)[100 * w + 60]! < 0.005);
  assert.ok(band(skyFromDepth(haze.d, haze.c, w, h, { blur: 0 }).mask) > 0.9, 'smooth haze joins the sky');
  assert.ok(band(skyFromDepth(town.d, town.c, w, h, { blur: 0 }).mask) < 0.1, 'a busy town does not');
}
console.log('skyMath: ok');
