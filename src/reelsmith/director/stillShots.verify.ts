import assert from 'node:assert/strict';
import { LIVELY_MOTION, STILL_MOTION, liveliestStart, livelyPick, meanMotion, stillThroughout } from './stillShots';

// IMG_2644 (Goa beach cafe, 4.75 s): the measured curve, still from end to end
const cafe = { hz: 4, values: [0, 0.1, 0.11, 0.13, 0.18, 0.13, 0.15, 0.19, 0.2, 0.16, 0.14, 0.15, 0.14, 0.12, 0.14, 0.14, 0.15, 0.18, 0.15] };
const m = meanMotion(cafe, 1, 3.75)!;
assert.ok(m < STILL_MOTION, `the 3.8 s hold from 1.0 s moves ${m}`);
assert.ok(stillThroughout(cafe, 4.75));
assert.ok(liveliestStart(cafe, 4.75, 3.75)!.motion < STILL_MOTION);
// a clip that sits still for 2 s, then people move: the liveliest 2 s start where they move
const mixed = { hz: 4, values: [0, ...Array(8).fill(0.05), ...Array(8).fill(0.4)] };
assert.ok(meanMotion(mixed, 0, 2)! < STILL_MOTION);
const best = liveliestStart(mixed, 4, 2)!;
assert.equal(best.at, 2);
assert.ok(best.motion >= LIVELY_MOTION);
assert.ok(!stillThroughout(mixed, 4));
// a veto keeps a start out (a stretch already used)
assert.ok(liveliestStart(mixed, 4, 2, (at) => at < 1.5)!.at <= 1.5);
// no curve: nothing is said
assert.equal(meanMotion(undefined, 0, 2), undefined);
assert.equal(stillThroughout(undefined, 4), false);

// the build's own pick: a still 2 s stretch moves to where people move, clear of a used stretch; a lively pick stays
assert.equal(livelyPick(mixed, 0, 60, 120, 30, []), 60);
assert.equal(livelyPick(mixed, 60, 60, 120, 30, []), 60);
assert.equal(livelyPick(mixed, 0, 30, 120, 30, []), 0, 'a 1 s shot is not a hold');
assert.equal(livelyPick(cafe, 30, 90, 142, 30, []), 30, 'a clip that never moves keeps its pick');
assert.equal(livelyPick(mixed, 0, 60, 120, 30, [[60, 120]]), 0, 'the moving stretch is taken already');
console.log('stillShots.verify: ok');
