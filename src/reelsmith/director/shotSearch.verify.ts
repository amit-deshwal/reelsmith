import assert from 'node:assert/strict';
import { MATCH_MAYBE, MATCH_SURE, lineFit, searchMoments, showsOf, type FrameVector } from './shotSearch';

// a toy 4-d space: axis 0 = water, 1 = people, 2 = food, 3 = night
const v = (...x: number[]) => x;
const frames: FrameVector[] = [
  { assetId: 'lake', sampleTime: 1, vector: v(1, 0, 0, 0) },
  { assetId: 'lake', sampleTime: 6, vector: v(0.9, 0.3, 0, 0) },
  { assetId: 'lake', sampleTime: 7, vector: v(0.95, 0.2, 0, 0) },
  { assetId: 'group', sampleTime: 2, vector: v(0.1, 1, 0, 0) },
  { assetId: 'group', sampleTime: 9, vector: v(0, 0.9, 0.1, 0) },
  { assetId: 'dinner', sampleTime: 3, vector: v(0, 0.2, 1, 0) },
  { assetId: 'camp', sampleTime: 4, vector: v(0, 0.1, 0.1, 1) },
];

// the nearest moments, one a clip, best first
const water = searchMoments(frames, v(1, 0, 0, 0), { limit: 3 });
assert.equal(water[0]!.assetId, 'lake');
assert.equal(water[0]!.atSec, 1, 'the frame that is most water');
assert.equal(water[0]!.standout, 1, 'it beats every other frame');
assert.equal(new Set(water.map((h) => h.assetId)).size, water.length, 'different clips');

// several from one clip must be apart in time
const two = searchMoments(frames, v(1, 0, 0, 0), { limit: 4, perClip: 3, minGapSec: 2 });
const lake = two.filter((h) => h.assetId === 'lake').map((h) => h.atSec);
assert.ok(lake.includes(1) && lake.some((t) => t >= 6), 'a second moment of the same clip, far from the first');
assert.ok(!(lake.includes(6) && lake.includes(7)), 'two frames a second apart are one moment');

// the director's numbered list limits the search
const only = searchMoments(frames, v(1, 0, 0, 0), { limit: 5, allowed: new Set(['group', 'dinner']) });
assert.ok(only.every((h) => h.assetId !== 'lake'));

// the share of the footage a hit beats says how special it is
const food = searchMoments(frames, v(0, 0, 1, 0), { limit: 2 });
assert.equal(food[0]!.assetId, 'dinner');
assert.ok(food[0]!.standout > food[1]!.standout);
assert.ok(food[1]!.standout < 1);

// nothing to search, or a query with no direction, finds nothing
assert.deepEqual(searchMoments([], v(1, 0, 0, 0), { limit: 3 }), []);
assert.deepEqual(searchMoments(frames, v(0, 0, 0, 0), { limit: 3 }), []);

// how well a shot already in the reel shows a line
const fitGood = lineFit(frames, v(1, 0, 0, 0), { assetId: 'lake', fromSec: 0, toSec: 2 })!;
const fitBad = lineFit(frames, v(1, 0, 0, 0), { assetId: 'dinner', fromSec: 2, toSec: 4 })!;
assert.ok(fitGood > 0.9 && fitBad < 0.5, `water line: lake ${fitGood}, dinner ${fitBad}`);
assert.equal(lineFit(frames, v(1, 0, 0, 0), { assetId: 'lake', fromSec: 50, toSec: 52 }), null, 'no frame near the shot: no judgement');
// the model's own scale, measured on real clips
assert.equal(showsOf(0.481), 'sure');
assert.equal(showsOf(0.43), 'maybe');
assert.equal(showsOf(0.392), 'weak');
assert.ok(MATCH_MAYBE < MATCH_SURE);
console.log('shotSearch.verify: ok');
