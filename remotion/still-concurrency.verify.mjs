// RS-1258: agent stills render a few at a time in one browser. Run: node remotion/still-concurrency.verify.mjs
// Measured on a 25.8 s director reel of the 20 trek clips (18 critique frames in 3 sheets): one at a time 12.6 s,
// three tabs a sheet 6.7 s, the three sheets at once ~5 s; one frame a section (6) 4.5 s -> 2.2 s.
import assert from 'node:assert/strict';
import { stillConcurrency } from './render.mjs';

assert.equal(stillConcurrency({}), 3, 'three tabs by default');
assert.equal(stillConcurrency({ RS_STILL_CONCURRENCY: '1' }), 1, 'one: the old one-by-one path');
assert.equal(stillConcurrency({ RS_STILL_CONCURRENCY: '5' }), 5);
assert.equal(stillConcurrency({ RS_STILL_CONCURRENCY: '64' }), 8, 'capped');
assert.equal(stillConcurrency({ RS_STILL_CONCURRENCY: '0' }), 3, 'nonsense keeps the default');
assert.equal(stillConcurrency({ RS_STILL_CONCURRENCY: 'many' }), 3);
console.log('still-concurrency.verify: ok');
