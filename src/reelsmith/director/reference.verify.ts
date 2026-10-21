import assert from 'node:assert/strict';
import type { ClipFeatures, WindowFeatures } from '../assembler/scoring';
import { checkAgainstReference, paletteWords, referenceLine, referenceProfile } from './reference';
import type { ShotLogClip } from './shotLog';
import { checkTreatment, parseTreatment } from './treatment';

// RS-1217: a reference reel measured with the clip analysis: its pace, motion and colour
const fps = 30;
const win = (from: number, motion: number): WindowFeatures => ({ startFrame: from * fps, endFrame: (from + 1) * fps, sharpness: 0.6, exposure: 0.8, motion, subject: 0.2, speech: false });
const fast: ClipFeatures = {
  assetId: 'ref', dHash: '0', color: { r: 0.62, g: 0.45, b: 0.3 },
  windows: Array.from({ length: 12 }, (_, i) => win(i, 0.4)),
  // a cut every 0.8 s over 12 s
  shotBoundariesFrame: Array.from({ length: 14 }, (_, i) => Math.round((i + 1) * 0.8 * fps)),
};
const footage: ShotLogClip[] = [1, 2, 3].map((n) => ({ n, kind: 'video', seconds: 10, features: { assetId: `a${n}`, dHash: '0', windows: Array.from({ length: 5 }, (_, i) => win(i * 2, 0.1)) } }));
const p = referenceProfile('ref.mp4', 12, fast, fps, footage);
assert.equal(p.shots, 15);
assert.equal(p.medianShotSec, 0.8);
assert.equal(p.motion, 'livelier than your footage');
assert.deepEqual(p.palette.words, ['warm', 'mid-tone', 'rich colour']);
assert.match(referenceLine(p, 120), /a new shot every 0\.8 s .*about 1\.6 beats a shot at 120 bpm.*warm/);
// one long take: one shot, as long as the reel
const take = referenceProfile('take.mp4', 9, { assetId: 't', dHash: '0', windows: [win(0, 0.05)] }, fps, footage);
assert.equal(take.shots, 1);
assert.equal(take.medianShotSec, 9);
assert.equal(take.motion, 'calmer than your footage');
assert.deepEqual(paletteWords({ r: 0.2, g: 0.22, b: 0.3 }), ['cool', 'dark', 'natural colour']);
assert.deepEqual(paletteWords({ r: 0.5, g: 0.5, b: 0.48 }), ['neutral', 'mid-tone', 'muted']);

// the built reel against it: a slow reel against a fast reference, and no look against a warm one
const slow = checkAgainstReference(p, { shotSec: [2.5, 2.5, 3, 2], sectionLooks: [] });
assert.ok(slow.some((f) => /every 2\.5 s .*reference every 0\.8 s/.test(f.issue) && /cut faster/.test(f.fix)));
assert.ok(slow.some((f) => /warm.*no look/.test(f.issue) && /golden-hour/.test(f.fix)));
assert.deepEqual(checkAgainstReference(p, { shotSec: [0.8, 1, 0.7, 0.9], look: 'golden-hour', sectionLooks: [] }), [], 'on pace and with a look: clean');
const breathe = checkAgainstReference(take, { shotSec: [1, 1, 1], sectionLooks: [] });
assert.ok(breathe.some((f) => /lets shots breathe/.test(f.issue)));

// the treatment must write a style guide when there is a reference, and the guide needs its four parts
const base = {
  story: 'two days in the hills', concepts: [{ name: 'A', idea: 'a' }, { name: 'B', idea: 'b' }], chosen: 0, tone: 'calm', heroes: [],
  parts: [{ role: 'hook', beats: 4, move: 'strips-reveal', purpose: 'where we are' }, { role: 'journey', beats: 8, move: 'cut', purpose: 'the walk' }, { role: 'ending', beats: 8, move: 'hold', purpose: 'the view we earned' }],
  signature: 'the reveal', textStyles: ['rise-lines'], transitions: ['light-dissolve'], effects: [], graphics: [],
};
const t = parseTreatment(base);
assert.ok(t.ok);
const ctx = { clips: footage, fps, reference: p };
assert.ok(checkTreatment((t as any).treatment, ctx).some((f) => /reference reel \(ref\.mp4\) and no styleGuide/.test(f.issue)));
assert.ok(!parseTreatment({ ...base, styleGuide: { pacing: 'fast' } }).ok, 'a style guide names pacing, palette, motion and doNotCopy');
const guided = parseTreatment({ ...base, styleGuide: { pacing: 'a cut every 0.8 s', palette: 'warm amber, deep shadows', motion: 'snaps, then holds', doNotCopy: 'the city and the dancer' } });
assert.ok(guided.ok);
assert.ok(!checkTreatment((guided as any).treatment, ctx).some((f) => /styleGuide/.test(f.issue)));
console.log('reference.verify ok');
