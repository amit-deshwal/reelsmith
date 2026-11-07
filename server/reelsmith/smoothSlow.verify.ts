// RS-1259: when slow motion needs in-between frames, where each frame of the copy sits in the source, and its sound.
import assert from 'node:assert/strict';
import { atempoChain, motionBlurName, needsSmoothing, SMOOTH_JOBS, smoothJobSlot, smoothPositions, smoothSlowName } from './smoothSlow.ts';

// fewer new pictures a second than the reel has frames
assert.equal(needsSmoothing(0.3, 30, 30), true, '30 fps clip at 0.3x: 9 pictures a second');
assert.equal(needsSmoothing(0.3, 60, 30), true, '60 fps clip at 0.3x in a 30 fps reel: 18');
assert.equal(needsSmoothing(0.5, 60, 30), false, '60 fps at 0.5x fills a 30 fps reel');
assert.equal(needsSmoothing(0.5, 60, 60), true, 'but not a 60 fps one');
assert.equal(needsSmoothing(0.5, 59.94, 30), false, 'NTSC rates count as full');
assert.equal(needsSmoothing(0.02, 30, 30), false, 'a hold is not slow motion');
assert.equal(needsSmoothing(1, 30, 30), false);
assert.equal(needsSmoothing(2.8, 30, 30), false);

// the copy's frame k shows source frame phase + k * rate * sourceFps / fps (what the editor showed, without the steps)
assert.deepEqual(smoothPositions(5, 0.3, 30, 30), [0, 0.3, 0.6, 0.9, 1.2]);
assert.deepEqual(smoothPositions(4, 0.25, 60, 60, 0.5), [0.5, 0.75, 1, 1.25]);
assert.deepEqual(smoothPositions(3, 0.3, 60, 30), [0, 0.6, 1.2], 'a 60 fps clip in a 30 fps reel');
assert.equal(smoothPositions(91, 0.3, 30, 30).at(-1), 27, 'no drift over a long span');

// ffmpeg's atempo takes 0.5-2 a stage; the stages multiply to the speed
const product = (chain: string) => chain.split(',').reduce((p, s) => p * Number(s.replace('atempo=', '')), 1);
for (const rate of [0.1, 0.12, 0.25, 0.3, 0.35, 0.5, 0.7, 0.99]) {
  const chain = atempoChain(rate);
  assert.ok(chain.split(',').every((s) => { const v = Number(s.replace('atempo=', '')); return v >= 0.5 && v <= 2; }), chain);
  assert.ok(Math.abs(product(chain) - rate) < 1e-6, `${rate}: ${chain}`);
}
assert.equal(atempoChain(0.3), 'atempo=0.5,atempo=0.6');
// and a sped-up span's sound (motion blur copies)
for (const rate of [1.6, 2, 2.8, 3.5, 4]) {
  const chain = atempoChain(rate);
  assert.ok(chain.split(',').every((s) => { const v = Number(s.replace('atempo=', '')); return v >= 0.5 && v <= 2; }), chain);
  assert.ok(Math.abs(product(chain) - rate) < 1e-6, `${rate}: ${chain}`);
}
assert.equal(atempoChain(2.8), 'atempo=2,atempo=1.4');
assert.equal(motionBlurName('/m/trek.MOV', 1.5, 2.8, 12, 30, 52), 'trek.blur-1500-2800x12f30s52.mp4');

// one name per span, speed and rate
assert.equal(smoothSlowName('/u/IMG_1.normalized.mp4', 1.2, 0.3, 90, 30), 'IMG_1.normalized.slow-1200-300x90f30.mp4');
assert.notEqual(smoothSlowName('a.mp4', 1.2, 0.3, 90, 30), smoothSlowName('a.mp4', 1.2, 0.35, 90, 30));
assert.equal(smoothSlowName('a.mp4', 0.5, 0.25, 180, 59.94), 'a.slow-500-250x180f59.94.mp4');

// copies are made SMOOTH_JOBS at a time, never more, even as finished jobs hand over to waiting ones
{
  let now = 0, most = 0;
  const order: number[] = [];
  await Promise.all(Array.from({ length: 10 }, (_, i) => smoothJobSlot(async () => {
    now += 1; most = Math.max(most, now);
    await new Promise((r) => setTimeout(r, 2 + (i % 3)));
    // a new caller arriving as this one finishes must wait its turn
    if (i === 0) void smoothJobSlot(async () => { now += 1; most = Math.max(most, now); now -= 1; });
    now -= 1;
    order.push(i);
  })));
  assert.equal(most, SMOOTH_JOBS);
  assert.equal(order.length, 10);
}

console.log('smoothSlow ok');
