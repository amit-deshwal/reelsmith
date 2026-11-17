import assert from 'node:assert/strict';
import type { ClipFeatures, WindowFeatures } from '../assembler/scoring';
import { unusedClips, unusedClipsNote } from './unusedClips';

const w = (exposure: number, sharpness: number) => ({ startFrame: 0, endFrame: 30, sharpness, exposure, motion: 0.3, subject: 0.2, speech: false } as WindowFeatures);
const f = (assetId: string, dHash: string, windows: WindowFeatures[]): ClipFeatures => ({ assetId, dHash, windows } as ClipFeatures);

const clips = [
  { id: 'a', name: 'A.MOV', kind: 'video' as const, seconds: 5 },
  { id: 'b', name: 'B.MOV', kind: 'video' as const, seconds: 5 },
  { id: 'c', name: 'C.MOV', kind: 'video' as const, seconds: 0.6 },
  { id: 'd', name: 'D.MOV', kind: 'video' as const, seconds: 5 },
  { id: 'e', name: 'E.MOV', kind: 'video' as const, seconds: 5 },
  { id: 'g', name: 'G.MOV', kind: 'video' as const, seconds: 5 },
];
const features = new Map<string, ClipFeatures>([
  ['a', f('a', '0000000000000000', [w(0.8, 0.8)])],
  ['b', f('b', '0000000000000001', [w(0.8, 0.8)])], // near-duplicate of a
  ['d', f('d', 'ffffffffffffffff', [w(0.05, 0.8), w(0.4, 0.8)])], // one dark window, one lit
  ['e', f('e', '0f0f0f0f0f0f0f0f', [w(0.8, 0.1)])], // soft
  ['g', f('g', 'f0f0f0f0f0f0f0f0', [w(0.1, 0.8), w(0.12, 0.8), w(0.5, 0.8)])],
]);
const u = unusedClips({ clips, usedIds: new Set(['a']), features });
assert.equal(u.count, 5);
assert.equal(u.total, 6);
assert.deepEqual(u.why, { duplicate: 1, short: 1, 'not picked': 2, soft: 1 });
assert.ok(u.clips[0]!.startsWith('#2 B.MOV (a near-duplicate'));
assert.ok(unusedClipsNote(u)!.startsWith('5 of 6 clips are not in the reel (2 of them usable)'));
assert.equal(unusedClipsNote(unusedClips({ clips: clips.slice(0, 1), usedIds: new Set(['a']), features })), undefined);

// nearly black from end to end
const dark = unusedClips({ clips: [{ id: 'x', name: 'X', kind: 'video', seconds: 4 }], usedIds: new Set(), features: new Map([['x', f('x', '1234123412341234', [w(0.05, 0.8), w(0.1, 0.8)])]]) });
assert.deepEqual(dark.why, { dark: 1 });
console.log('unusedClips.verify: ok');
