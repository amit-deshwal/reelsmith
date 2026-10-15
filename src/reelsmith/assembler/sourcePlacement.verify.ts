import assert from 'node:assert/strict';
import type { AssemblyClip } from './types';
import { sourcePlacement } from './sourcePlacement';
import { clipItem } from './common';
import { toAssemblyClips, type ClipFeatures } from './scoring';

const clip: AssemblyClip = { assetId: 'a', name: 'Two shots', src: '/a', kind: 'video', score: 1, durationInFrames: 180,
  sourceAnalysis: { minShotFrames: 15, shotBoundariesFrame: [90], windows: [
    { startFrame: 0, endFrame: 60, score: 0.2 },
    { startFrame: 60, endFrame: 90, score: 1 },
    { startFrame: 90, endFrame: 150, score: 0.8 },
    { startFrame: 150, endFrame: 180, score: 0.1 },
  ] } };
assert.deepEqual(sourcePlacement(clip, 30), { srcInFrame: 60, playbackRate: 1 }, 'highest scoring short range');
assert.deepEqual(sourcePlacement(clip, 60), { srcInFrame: 90, playbackRate: 1 }, 'duration changes the best range; never run through the cut at 90');
assert.deepEqual(sourcePlacement(clip, 120), { srcInFrame: 90, playbackRate: 0.75 }, 'slow one complete shot instead of crossing the cut');
assert.throws(() => sourcePlacement(clip, 400), /no single shot is long enough/);
for (const length of [1, 15, 30, 45, 60, 90, 120, 180, 360]) {
  const placement = sourcePlacement(clip, length);
  const end = placement.srcInFrame + length * placement.playbackRate;
  assert.ok(end <= clip.durationInFrames);
  assert.ok(!(placement.srcInFrame < 90 && end > 90), `length ${length} crosses cut`);
  assert.ok(placement.playbackRate >= 0.25 && placement.playbackRate <= 1);
  assert.deepEqual(sourcePlacement(clip, length), placement, 'deterministic selection');
}
const placed = clipItem('i', clip, 'V1', 60) as { item: { srcInFrame: number; playbackRate?: number } };
assert.equal(placed.item.srcInFrame, 90, 'all common recipe placements use the duration-aware picker');
const truncated: AssemblyClip = { ...clip, durationInFrames: 900, sourceAnalysis: { minShotFrames: 15, shotBoundariesFrame: [], windows: [{ startFrame: 0, endFrame: 60, score: 1 }] } };
assert.throws(() => sourcePlacement(truncated, 300), /no single shot is long enough/, 'unanalysed tail is not used');
assert.equal(sourcePlacement({ ...clip, sourceAnalysis: undefined, bestStartFrame: 30 }, 60).srcInFrame, 30, 'legacy/unanalysed inputs remain supported');

// Scoring preserves source ranges rather than throwing away the chosen window's end.
const features: ClipFeatures = { assetId: 'a', dHash: '1234567890abcdef', shotBoundariesFrame: [90], windows: [
  { startFrame: 0, endFrame: 90, sharpness: 0.2, exposure: 0.2, motion: 0, subject: 0, speech: false },
  { startFrame: 90, endFrame: 180, sharpness: 1, exposure: 1, motion: 1, subject: 1, speech: true },
] };
const scored = toAssemblyClips([clip], [features], 30)[0]!;
assert.deepEqual(scored.sourceAnalysis!.shotBoundariesFrame, [90]);
assert.equal(sourcePlacement(scored, 60).srcInFrame, 90);
const gapped = { ...clip, sourceAnalysis: { minShotFrames: 1, shotBoundariesFrame: [], windows: [
  { startFrame: 0, endFrame: 20, score: 1 }, { startFrame: 40, endFrame: 60, score: 1 },
] } };
assert.throws(() => sourcePlacement(gapped, 45), /no single shot is long enough/, 'never bridge unmeasured gaps');
const tiny = { ...features, shotBoundariesFrame: [5, 10], windows: features.windows.slice(0, 1) };
assert.equal(toAssemblyClips([{ ...clip, durationInFrames: 15 }], [tiny], 15).length, 0, 'discard shots below minClipSec');
console.log('sourcePlacement.verify: ok');
