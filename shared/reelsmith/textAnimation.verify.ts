import assert from 'node:assert/strict';
import { textAnimationKeyframes } from './textAnimation';

const base = { y: -22, scale: 1, opacity: 1 };
assert.deepEqual(textAnimationKeyframes('none', 'none', 60, 9, base), []);

const fadeIn = textAnimationKeyframes('fade', 'none', 60, 9, base);
assert.deepEqual(fadeIn.map((k) => [k.prop, k.frame, k.value]), [['opacity', 0, 0], ['opacity', 9, 1]]);

const both = textAnimationKeyframes('slide-up', 'drop', 60, 9, base);
const y = both.filter((k) => k.prop === 'y').map((k) => [k.frame, k.value]);
assert.deepEqual(y, [[0, -14], [9, -22], [50, -22], [59, -37]], 'y slides in from below and drops out upwards, base held between');
const op = both.filter((k) => k.prop === 'opacity').map((k) => [k.frame, k.value]);
assert.deepEqual(op, [[0, 0], [9, 1], [50, 1], [59, 0]]);

const pop = textAnimationKeyframes('pop', 'none', 60, 9, { y: 0, scale: 1.5, opacity: 1 });
assert.equal(pop.find((k) => k.prop === 'scale' && k.frame === 0)!.value, 0.9, 'scale is relative to the clip\'s own scale');

// a clip shorter than twice the animation shrinks it instead of overlapping in/out
const short = textAnimationKeyframes('fade', 'fade', 10, 9, base);
const frames = short.filter((k) => k.prop === 'opacity').map((k) => k.frame);
assert.deepEqual(frames, [...frames].sort((a, b) => a - b));
assert.ok(frames[1]! < frames[2]!, 'in finishes before out starts');
console.log('textAnimation.verify: ok');
