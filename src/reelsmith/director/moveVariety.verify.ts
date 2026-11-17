import assert from 'node:assert/strict';
import { freshMoves, moveCounts, ownMoves, repeatsLast, varietyFinding } from './moveVariety';

// the Goa skeleton of 2026-11-17 (both runs): zoom-punch hook, cut, hold, velocity, break-in, zoom-punch, hold
const goa = ['zoom-punch', 'cut', 'hold', 'velocity', 'break-in', 'zoom-punch', 'hold'];
assert.deepEqual(ownMoves(goa), ['break-in', 'velocity', 'zoom-punch']);
assert.deepEqual(moveCounts([goa, goa, ['cut', 'split']]), [['break-in', 2], ['velocity', 2], ['zoom-punch', 2], ['split', 1]]);
const people = { people: true, photos: false };

// with no earlier reel the stock arc is named, with moves to try
const stock = varietyFinding(goa, [], people)!;
assert.match(stock.issue, /the stock arc \(break-in, velocity, zoom-punch\)/);
assert.match(stock.fix, /freeze-intro, match-cut/);
// the second run of the same brief: the same moves as the last reel, with the counts
const again = varietyFinding(['zoom-punch', 'cut', 'velocity', 'hold', 'break-in'], [goa], people)!;
assert.match(again.issue, /same moves as the last reel in this project \(break-in, velocity, zoom-punch\)/);
assert.match(again.issue, /break-in ×1, velocity ×1, zoom-punch ×1/);
assert.match(again.fix, /refuses the last reel's moves once/);
// a different reel passes; a reel with one stock move and fresh ones passes
assert.equal(varietyFinding(['freeze-intro', 'cut', 'match-cut', 'velocity', 'split'], [goa], people), undefined);
assert.equal(varietyFinding(['cut', 'hold'], [goa], people), undefined, 'a plain reel is the plain rule\'s business');
// fresh moves leave out what was used, and person moves without people
assert.ok(!freshMoves([['freeze-intro', 'split']], people).includes('freeze-intro'));
assert.ok(!freshMoves([], { people: false, photos: false }).includes('freeze-intro'));
assert.ok(freshMoves([], { people: false, photos: true }).includes('photo-3d'));
// the plan rule's test: the last reel's moves again (order and plain moves aside), not an earlier one
assert.equal(repeatsLast(['velocity', 'zoom-punch', 'cut', 'break-in'], [goa]), 'break-in, velocity, zoom-punch');
assert.equal(repeatsLast(goa, [goa, ['split', 'pip']]), undefined);
assert.equal(repeatsLast(goa, []), undefined);
assert.equal(repeatsLast(['cut', 'velocity'], [['velocity', 'hold']]), undefined, 'one move is not a reel');

console.log('moveVariety.verify: ok');
