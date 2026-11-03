// RS-1261: the sky of every tile of a depth track. A synthetic handheld pan: the horizon tilts and drifts across eight
// tiles, so one map of the first frame misses sky the later frames show. Each tile's own map follows the horizon; a tile
// whose own rule loses a patch of hazy valley gets it back from its neighbours (the median in time); the depth may sit
// anywhere in the track's shared range (each tile is stretched to its own); the colour models blend between tiles.
import assert from 'node:assert/strict';
import { parseDepthTrackMeta, skyModelBetween } from '../../shared/reelsmith/depthTrack.ts';
import { skyFromDepth } from './skyMath.ts';
import { skyTrackFrom, stretchOwnRange, TRACK_GATE_REACH } from './skyTrackMath.ts';

const w = 90, h = 160;
const frames = 8;
const horizonAt = (k: number, x: number) => 50 + k * 6 + Math.round((x - w / 2) * 0.12 * (k % 3 - 1));

function frame(k: number, lift = 0): { depth: Uint8Array; rgb: Uint8Array; truth: Uint8Array } {
  const depth = new Uint8Array(w * h), rgb = new Uint8Array(w * h * 3), truth = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, n = ((x * 7 + y * 13 + k) % 5) - 2;
    if (y < horizonAt(k, x)) {
      const l = 170 + Math.round(y * 0.3) + n;
      // the track's shared range: this frame's far end sits at `lift`, not 0
      depth[p] = lift + 2; rgb.set([l - 30, l - 12, l + 22], p * 3); truth[p] = 1;
    } else {
      depth[p] = lift + 40 + Math.round((y - horizonAt(k, x)) * 1.5);
      rgb.set([70 + n, 115, 60], p * 3);
    }
  }
  return { depth, rgb, truth };
}

const shots = Array.from({ length: frames }, (_, k) => frame(k, k === 5 ? 60 : 0));
const track = skyTrackFrom(shots.map((s) => s.depth), shots.map((s) => s.rgb), w, h);
assert.equal(track.masks.length, frames);
assert.equal(track.gates.length, frames);

const cover = (mask: Uint8Array, truth: Uint8Array) => {
  let skyHit = 0, sky = 0, landHit = 0, land = 0;
  for (let p = 0; p < truth.length; p++) {
    if (truth[p]) { sky++; if (mask[p]! > 127) skyHit++; } else { land++; if (mask[p]! > 127) landHit++; }
  }
  return { sky: skyHit / sky, land: landHit / land };
};
// every tile's own sky, though its horizon has moved and tilted (tile 5's depth lifted by 60 in the shared range)
for (let k = 0; k < frames; k++) {
  const c = cover(track.masks[k]!, shots[k]!.truth);
  assert.ok(c.sky >= 0.95, `tile ${k}: covers ${(100 * c.sky).toFixed(1)}% of its sky`);
  assert.ok(c.land < 0.02, `tile ${k}: covers ${(100 * c.land).toFixed(1)}% of its land`);
  assert.ok(track.models[k], `tile ${k} has the sky's colour`);
}
// one map of the first frame misses the sky the camera tilts up to (what a still map did on a handheld shot)
const first = skyFromDepth(shots[0]!.depth, shots[0]!.rgb, w, h, { blur: 1 });
const stale = cover(first.mask, shots[frames - 1]!.truth);
const fresh = cover(track.masks[frames - 1]!, shots[frames - 1]!.truth);
assert.ok(stale.sky < 0.8 && fresh.sky >= 0.95, `the first frame's map covers ${(100 * stale.sky).toFixed(1)}% of the last frame's sky, its own ${(100 * fresh.sky).toFixed(1)}%`);

// the gate is narrow: about a fiftieth of the short edge beyond the sky
const gateRow = (k: number, x: number) => { let y = 0; while (y < h && track.gates[k]![y * w + x]! > 0) y++; return y; };
const reach = gateRow(3, 45) - horizonAt(3, 45);
assert.ok(reach > 0 && reach <= Math.ceil(w * TRACK_GATE_REACH * 1.5) + 1, `gate reaches ${reach} px past the sky`);

// a flicker: one tile loses a patch of its sky (its own rule says land); the median in time gives it back
const flick = Array.from({ length: 5 }, () => frame(2));
for (let y = 10; y < 30; y++) for (let x = 10; x < 40; x++) flick[2]!.rgb.set([60, 120, 60], (y * w + x) * 3);
const steady = skyTrackFrom(flick.map((s) => s.depth), flick.map((s) => s.rgb), w, h);
assert.equal(steady.masks[2]![20 * w + 25], 255, 'a patch lost in one tile is kept from its neighbours');

// a track with no sky: no masks, no models
const wall = skyTrackFrom([new Uint8Array(w * h).fill(120)], [new Uint8Array(w * h * 3).fill(128)], w, h);
assert.ok(wall.masks[0]!.every((v) => v === 0) && wall.models[0] === null);

// stretching to the tile's own range
const stretched = [...stretchOwnRange(Uint8Array.from({ length: 100 }, (_, i) => 50 + i))];
assert.ok(stretched[0] === 0 && stretched[99] === 255 && stretched.every((v, i) => i === 0 || v >= stretched[i - 1]!));

// the index: sky models per tile, a malformed sky dropped without losing the depth
const base = { version: 1, fromSec: 0, step: 0.125, count: 2, cols: 2, rows: 1, tileWidth: w, tileHeight: h, subject: [0.7, 0.7] };
const m = track.models[0]!, m2 = track.models[7]!;
assert.equal(parseDepthTrackMeta({ ...base, sky: [m, null] })?.sky?.[1], null);
const dropped = parseDepthTrackMeta({ ...base, sky: [m] });
assert.ok(dropped && dropped.sky === undefined, 'a sky index of the wrong length is dropped, the depth kept');
assert.ok(parseDepthTrackMeta(base) && parseDepthTrackMeta(base)!.sky === undefined);
const half = skyModelBetween(m, m2, 0.5)!;
assert.ok(Math.abs(half.lumaFloor - (m.lumaFloor + m2.lumaFloor) / 2) < 1e-9);
assert.equal(skyModelBetween(null, m2, 0.3), m2);
assert.equal(skyModelBetween(null, null, 0.3), null);
console.log('skyTrackMath: ok');
