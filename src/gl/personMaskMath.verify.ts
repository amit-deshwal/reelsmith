// The matte maths: soft threshold, centroid and box in shader coordinates (y up), noise-proof box, empty frames.
import assert from 'node:assert/strict';
import { matteFromConfidence, NO_SUBJECT, subjectUniforms, syntheticPersonConfidence } from './personMaskMath';

const W = 40, H = 30;
const blank = () => new Float32Array(W * H);
// a 10 x 12 block at x 5..14, y 3..14 (row 0 = top)
const conf = blank();
for (let y = 3; y < 15; y++) for (let x = 5; x < 15; x++) conf[y * W + x] = 0.95;
const { rgba, subject } = matteFromConfidence(conf, W, H);
assert.equal(rgba.length, W * H * 4);
assert.equal(rgba[(5 * W + 8) * 4], 255, 'inside is solid');
assert.equal(rgba[(5 * W + 8) * 4 + 3], 255, 'the matte is opaque, so upload cannot square it');
assert.equal(rgba[(20 * W + 30) * 4], 0, 'outside is empty');
assert.ok(Math.abs(subject.cx - 10 / W) < 0.01, `centre x ${subject.cx}`);
assert.ok(Math.abs(subject.cy - (1 - 9 / H)) < 0.02, `centre y is flipped to shader space: ${subject.cy}`);
assert.ok(Math.abs(subject.w - 10 / W) < 0.03 && Math.abs(subject.h - 12 / H) < 0.04, 'box');
assert.ok(subject.area > 0.09 && subject.area < 0.11, 'area share');

// soft edges: mid confidence is mid matte
const soft = blank(); soft.fill(0.5);
assert.ok(matteFromConfidence(soft, W, H).rgba[0]! > 100 && matteFromConfidence(soft, W, H).rgba[0]! < 160);

// a stray speck does not stretch the box
const noisy = Float32Array.from(conf);
noisy[28 * W + 38] = 1;
assert.ok(Math.abs(matteFromConfidence(noisy, W, H).subject.w - subject.w) < 0.02, 'one speck is ignored');

// nobody: the stand-in box, area 0
const empty = matteFromConfidence(blank(), W, H).subject;
assert.deepEqual(empty, NO_SUBJECT);

// uniforms
assert.deepEqual(subjectUniforms(subject).u_subjectCenter, [subject.cx, subject.cy]);

// the synthetic head-and-shoulders: head above body, centred, sensible size
const syn = matteFromConfidence(syntheticPersonConfidence(96, 54), 96, 54).subject;
assert.ok(Math.abs(syn.cx - 0.5) < 0.02 && syn.area > 0.1 && syn.h > 0.7, JSON.stringify(syn));
console.log('personMaskMath.verify ok');
