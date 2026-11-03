import assert from 'node:assert/strict';
import type { ClipFeatures, WindowFeatures } from '../assembler/scoring';
import { auditPicks, betterStretch, stretchOf, strongLeftOut, type UsedShot } from './pickAudit';

const fps = 30;
const win = (startSec: number, endSec: number, sharpness: number, exposure = 0.7, motion = 0.3): WindowFeatures => ({
  startFrame: startSec * fps, endFrame: endSec * fps, sharpness, exposure, motion, subject: 0.2, speech: false,
});
const clip = (assetId: string, windows: WindowFeatures[]): ClipFeatures => ({ assetId, dHash: '0'.repeat(16), windows });
// #1: soft first 4 s, sharp after; #2: dark throughout; #3: fine; #4: a strong clip nobody used
const features = new Map<string, ClipFeatures>([
  ['a', clip('a', [win(0, 2, 0.1), win(2, 4, 0.15), win(4, 6, 0.8), win(6, 8, 0.75)])],
  ['b', clip('b', [win(0, 2, 0.6, 0.1), win(2, 4, 0.6, 0.12)])],
  ['c', clip('c', [win(0, 2, 0.7), win(2, 4, 0.72)])],
  ['d', clip('d', [win(0, 2, 0.95, 0.9), win(2, 4, 0.9, 0.85)])],
]);
const label = (id: string) => `#${'abcd'.indexOf(id) + 1}`;

// the mean of the windows a shot covers, weighted by overlap
const s = stretchOf(features.get('a')!, 1 * fps, 2 * fps)!;
assert.ok(s.sharpness > 0.1 && s.sharpness < 0.2, 'covers the first two soft windows');
assert.equal(stretchOf(features.get('a')!, 100 * fps, fps), null, 'a shot past the analysis has no stretch');

// a better stretch of the same clip, but only when it is clearly better
const alt = betterStretch(features.get('a')!, 2 * fps, 0.2)!;
assert.equal(alt.inFrame, 4 * fps, 'the sharp part of the clip');
assert.equal(betterStretch(features.get('c')!, 2 * fps, 0.7), null, 'a clip that is good everywhere has nothing better');

// the audit names the soft shot with a fix, the dark one with "another clip", and leaves the good one alone
const used: UsedShot[] = [
  { section: 1, assetId: 'a', inFrame: 0, frames: 2 * fps },
  { section: 2, assetId: 'b', inFrame: 0, frames: 2 * fps },
  { section: 3, assetId: 'c', inFrame: 0, frames: 2 * fps },
];
const findings = auditPicks({ used, features, label, fps });
assert.equal(findings.length, 2);
assert.match(findings[0]!.issue, /section 1 shows #1@0, which is out of focus/);
assert.match(findings[0]!.fix, /use #1@4 instead/);
assert.match(findings[1]!.issue, /section 2 shows #2@0, which is (too dark|nearly black)/);
assert.match(findings[1]!.fix, /another clip/);

// the same shot used twice is named once; photos get no moment in their name
const twice = auditPicks({ used: [used[0]!, { ...used[0]!, section: 1 }], features, label, fps });
assert.equal(twice.length, 1);
const photo = auditPicks({ used: [{ section: 0, assetId: 'a', inFrame: 0, frames: 90 }], features, label, fps, isImage: () => true });
assert.match(photo[0]!.issue, /shows #1, which/);
assert.match(photo[0]!.fix, /another clip/);

// clips with no analysis are skipped, never a crash
assert.deepEqual(auditPicks({ used: [{ section: 0, assetId: 'zzz', inFrame: 0, frames: 30 }], features, label, fps }), []);

// strong clips left out while weaker ones play
const left = strongLeftOut(features, new Set(['a', 'b', 'c']), used, fps);
assert.deepEqual(left.map((l) => l.assetId), ['d'], 'the sharp, well-lit clip nobody used');
assert.ok(left[0]!.score >= 0.72);
assert.deepEqual(strongLeftOut(features, new Set(['a', 'b', 'c', 'd']), used, fps), [], 'nothing left out');
console.log('pickAudit.verify: ok');
