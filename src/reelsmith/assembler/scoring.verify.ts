import assert from 'node:assert/strict';
import { bestWindow, groupNearDuplicates, hammingDistance, scoreWindow, toAssemblyClips, type ClipFeatures, type WindowFeatures } from './scoring';
import { pickClips } from './beatMontage';

const win = (start: number, end: number, o: Partial<WindowFeatures> = {}): WindowFeatures => ({
  startFrame: start, endFrame: end, sharpness: 0.5, exposure: 0.5, motion: 0.5, subject: 0.1, speech: false, ...o,
});

// highest-scoring window per shot; windows shorter than the shot are skipped
const f: ClipFeatures = {
  assetId: 'a', dHash: '0000000000000000',
  windows: [win(0, 90, { sharpness: 0.2 }), win(90, 200, { sharpness: 0.95, exposure: 0.9 }), win(200, 215, { sharpness: 1, exposure: 1 })],
};
assert.equal(bestWindow(f, 30)!.startFrame, 90, 'best window that fits');
assert.equal(bestWindow(f, 500)!.startFrame, 90, 'falls back to the longest window');
assert.ok(scoreWindow(win(0, 1, { sharpness: 1, exposure: 1, motion: 1, subject: 1, speech: true })) > 0.99);
assert.ok(scoreWindow(win(0, 1, { sharpness: 0, exposure: 0, motion: 0, subject: 0 })) < 0.01);

// near-duplicate grouping by dHash + capture gap
assert.equal(hammingDistance('ffffffffffffffff', 'fffffffffffffffe'), 1);
assert.equal(hammingDistance('0000000000000000', 'ffffffffffffffff'), 64);
const mk = (id: string, hash: string, t: number): ClipFeatures => ({ assetId: id, dHash: hash, captureTimeMs: t, windows: [win(0, 100)] });
const set = [
  mk('a', 'f0f0f0f0f0f0f0f0', 0), mk('b', 'f0f0f0f0f0f0f0f1', 5_000), mk('c', 'f0f0f0f0f0f0f0f3', 8_000),
  mk('d', '0f0f0f0f0f0f0f0f', 9_000), mk('e', 'f0f0f0f0f0f0f0f0', 3 * 3_600_000),
];
const groups = groupNearDuplicates(set);
assert.equal(groups.get('a'), groups.get('b'));
assert.equal(groups.get('a'), groups.get('c'));
assert.equal(groups.has('d'), false, 'different picture is alone');
assert.equal(groups.has('e'), false, 'same picture hours apart is not a duplicate');

// the picker never selects two clips from one group and keeps the best of each
const feats = set.map((s, i) => ({ ...s, windows: [win(0, 100, { sharpness: i === 1 ? 1 : 0.3 })] }));
const clips = toAssemblyClips(
  feats.map((s) => ({ assetId: s.assetId, name: s.assetId, src: `/${s.assetId}`, kind: 'video' as const, durationInFrames: 100 })),
  feats, 30,
);
const picked = pickClips(clips, 5, false, 1);
assert.equal(picked.length, 3, 'a,b,c collapse to one; d and e remain');
assert.ok(picked.some((c) => c.assetId === 'b'), 'best of the group wins');
assert.ok(!picked.some((c) => c.assetId === 'a' || c.assetId === 'c'));

console.log('scoring.verify: ok');
