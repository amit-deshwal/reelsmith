import assert from 'node:assert/strict';
import { effectMixFor } from './effectTiming';
import { mixAmountAt } from '../effectMix';
import { parsePlan } from '../../../shared/reelsmith/directorPlan';

// a 4-beat section at 120 bpm (15 frames a beat at 30 fps) from frame 30 to 90; a clip from frame 45 to 90
const clock = { fps: 30, start: 30, end: 90, beats: 4, beatAt: (b: number) => 30 + b * 15 };
assert.equal(effectMixFor({ id: 'glitch' }, clock, 45, 45), undefined);
assert.deepEqual(effectMixFor({ id: 'glitch', strength: 0.6, region: 'background' }, clock, 45, 45), { amount: 0.6, region: 'background' });
const beat = effectMixFor({ id: 'glitch', timing: 'beat' }, clock, 45, 45)!;
// the punch before the clip (beat 0 at -0.5 s) is kept, then beats 1-3
assert.deepEqual(beat.hits, [0, 0.5, 1]);
assert.equal(mixAmountAt(beat, 0.5, 1.5), 1);
assert.ok(mixAmountAt(beat, 0.9, 1.5) < 0.3);
const halfBeats = effectMixFor({ id: 'glitch', timing: 'beat', every: 2 }, clock, 30, 60)!;
assert.deepEqual(halfBeats.hits, [0, 1]);
const drop = effectMixFor({ id: 'zoom-blur', timing: 'drop' }, clock, 30, 60)!;
assert.equal(mixAmountAt(drop, 0, 2), 1);
assert.ok(mixAmountAt(drop, 1.5, 2) < 0.1);
const fade = effectMixFor({ id: 'light-leak', timing: 'fade' }, clock, 30, 60)!;
assert.deepEqual(fade.span, [0, 2]);
assert.equal(mixAmountAt(fade, 0, 2), 0);
assert.equal(mixAmountAt(fade, 1, 2), 1);
const build = effectMixFor({ id: 'shake', timing: 'build' }, clock, 30, 60)!;
assert.ok(mixAmountAt(build, 0.2, 2) < mixAmountAt(build, 1.8, 2));

// plan parsing
const ok = parsePlan({ sections: [{ move: 'cut', effects: [{ id: 'glitch', timing: 'beat', every: 2, strength: 0.7, region: 'background' }] }] });
assert.ok(ok.ok && ok.plan.sections[0]!.effects![0]!.timing === 'beat');
const bad = parsePlan({ sections: [{ move: 'cut', effects: [{ id: 'glitch', timing: 'wobble', strength: 3, region: 'water', every: 0 }] }] });
assert.ok(!bad.ok && bad.errors.length === 4, JSON.stringify(bad));
console.log('effectTiming: ok');
