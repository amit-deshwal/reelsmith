import assert from 'node:assert/strict';
import { parallaxMoveAt, photoParallax } from './depthMoves';
import { PARALLAX_MOVES } from '../../gl/fx/depthFx';

// auto: dolly, orbit, rise in turn from the seed; a named move everywhere
assert.deepEqual([0, 1, 2, 3].map((i) => parallaxMoveAt('auto', i)), [0, 1, 2, 0]);
assert.deepEqual([0, 1].map((i) => parallaxMoveAt('auto', i, 2)), [2, 0]);
assert.deepEqual([0, 1, 2].map((i) => parallaxMoveAt('rise', i, 5)), [2, 2, 2]);
assert.equal(PARALLAX_MOVES[parallaxMoveAt('orbit', 0)], 'orbit');
// one photo per 4 beats by default, at most 12
assert.equal(photoParallax.clipCount!(12, {}, 1080, 1920), 3);
assert.equal(photoParallax.clipCount!(10, { every: 2 }, 1080, 1920), 5);
assert.equal(photoParallax.clipCount!(48, { every: 2 }, 1080, 1920), 12);
console.log('depthMoves.verify: ok');
