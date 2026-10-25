import assert from 'node:assert/strict';
import { levelOver, paceFindings, songLifts, songMap, songMapText } from './songMap';
import { reviewDirectorPlan } from './review';
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';

// a song of 32 bars: a verse (8 bars), a quiet break (8), a loud chorus (8), an outro (8)
const bars = [...Array(8).fill(3), ...Array(8).fill(1), ...Array(8).fill(6), ...Array(8).fill(2)];
const energy = bars.flatMap((v) => [v, v * 0.9, v * 0.95, v * 0.85]);

// levels are ranked against the whole song: the intro is quiet, the chorus loud
const m = songMap(energy, 0, 4, 32)!;
assert.ok(m);
assert.equal(m.levels.length, 32);
assert.ok(m.levels.slice(8, 16).every((v) => v <= 2), 'the break reads quiet');
assert.ok(m.levels.slice(0, 8).every((v) => v === 3), 'the verse sits between');
assert.ok(m.levels.slice(24).every((v) => v === 2), 'the outro');
assert.ok(m.levels.slice(16, 24).every((v) => v === 5), 'chorus reads loudest');
assert.deepEqual(songLifts(m), [64], 'the song lifts into the chorus on beat 64');

// from a later start the map counts bars from the reel start, still ranked against the whole song
const late = songMap(energy, 56, 4, 8)!;
assert.deepEqual(late.levels.slice(0, 2).map((v) => v <= 3), [true, true]);
assert.equal(late.levels[2], 5, 'bar 3 of the reel is the chorus');
assert.deepEqual(songLifts(late), [8]);
assert.match(songMapText(late), /\| /, 'phrases of four bars');
assert.match(songMapText(late), /lifts on beat 8/);
assert.equal(levelOver(late, 8, 16), 5);

// a flat song, too little analysis or none: no map
assert.equal(songMap(Array(64).fill(1), 0, 4, 8), null);
assert.equal(songMap([1, 2, 3], 0, 4, 8), null);
assert.equal(songMap(undefined, 0, 4, 8), null);

// the plan against the song: reel of 8 bars starting 2 bars before the chorus (beats 0-7 quiet, 8-31 loud)
const plan = (sections: ReelPlan['sections']): ReelPlan => ({ version: 1, ratio: '9:16', sections });
const span = (lens: number[]) => { let b = 0; return lens.map((l) => { const s = { b0: b, b1: b + l }; b += l; return s; }); };
// flash cuts over the quiet bars, a long hold over the chorus, a transition on beat 13
const bad = plan([
  { move: 'hold', beats: 2 }, { move: 'flash-cuts', beats: 4 }, { move: 'cut', beats: 7, params: { every: 2 } },
  { move: 'hold', beats: 8, transition: 'zoom-through' }, { move: 'hold', beats: 4 },
]);
const f = paceFindings(bad, span([2, 4, 7, 8, 4]), late);
assert.ok(f.some((x) => x.section === 1 && /quiet stretch/.test(x.issue) && /beat 8/.test(x.fix)), 'fast cuts over quiet bars, with where it lifts');
assert.ok(f.some((x) => x.section === 3 && /loudest part/.test(x.issue)), 'a hold over the chorus');
assert.ok(f.some((x) => x.section === 3 && /beat 13, an odd beat/.test(x.issue)));
assert.ok(!f.some((x) => x.section === 4), 'the last section may hold over loud bars');
// the hook may burst over a quiet intro
assert.ok(!paceFindings(plan([{ move: 'flash-cuts', beats: 4 }, { move: 'zoom-punch', beats: 8 }]), span([4, 8]), late).some((x) => x.section === 0));
// slow on the quiet bars, fast on the loud ones, changes on bar lines: clean
const good = plan([
  { move: 'hold', beats: 4 }, { move: 'cut', beats: 4, params: { every: 2 } }, { move: 'zoom-punch', beats: 8, transition: 'zoom-through' },
  { move: 'flash-cuts', beats: 4 }, { move: 'hold', beats: 8 },
]);
assert.deepEqual(paceFindings(good, span([4, 4, 8, 4, 8]), late), []);

// the review runs it from the build's spans (seconds) at the song's tempo
const spansSec = [4, 4, 8, 4, 8].reduce<Array<{ from: number; to: number }>>((acc, b) => [...acc, { from: acc.at(-1)?.to ?? 0, to: (acc.at(-1)?.to ?? 0) + b * 0.5 }], []);
assert.ok(!reviewDirectorPlan({ plan: good, spans: spansSec, song: { seconds: 120, bpm: 120 }, songMap: late }).some((x) => /quiet stretch|loudest part|odd beat/.test(x.issue)));
const badSec = [2, 4, 7, 8, 4].reduce<Array<{ from: number; to: number }>>((acc, b) => [...acc, { from: acc.at(-1)?.to ?? 0, to: (acc.at(-1)?.to ?? 0) + b * 0.5 }], []);
assert.ok(reviewDirectorPlan({ plan: bad, spans: badSec, song: { seconds: 120, bpm: 120 }, songMap: late }).some((x) => /odd beat/.test(x.issue)));

// RS-1228 eye trace: a section whose fast cuts throw the subject across the frame is flagged; one close jump is not
const cuts = plan([{ move: 'flash-cuts', beats: 4 }, { move: 'cut', beats: 8, params: { every: 1 } }]);
const two = [{ from: 0, to: 2 }, { from: 2, to: 6 }];
const eye = reviewDirectorPlan({ plan: cuts, spans: two, eyeJumps: [{ section: 1, at: 2.5, jump: 0.6 }, { section: 1, at: 3, jump: 0.5 }, { section: 1, at: 3.5, jump: 0.1 }, { section: 0, at: 0.5, jump: 0.7 }] });
assert.ok(eye.some((x) => x.section === 1 && /jumps across the frame/.test(x.issue) && /50%/.test(x.issue)));
assert.ok(!eye.some((x) => x.section === 0 && /jumps/.test(x.issue)), 'one measured cut is not a pattern');

// RS-1225 only the longest voice muted under the song is named, and none once the reel lets one moment be heard
const voices = [{ section: 0, at: 0.5, seconds: 1.6 }, { section: 1, at: 2.4, seconds: 2.1 }, { section: 1, at: 4.5, seconds: 1.6 }];
const named = reviewDirectorPlan({ plan: cuts, spans: two, voices }).filter((x) => /talks through/.test(x.issue));
assert.deepEqual(named.map((x) => x.section), [1]);
assert.match(named[0]!.issue, /2.1 s shot at 2.4 s/);
const heard = plan([{ move: 'flash-cuts', beats: 4 }, { move: 'cut', beats: 8, naturalSound: 'under' }]);
assert.ok(!reviewDirectorPlan({ plan: heard, spans: two, voices }).some((x) => /talks through/.test(x.issue)));

// RS-1226 a loop that fades to black, dips out or restarts the song mid-bar
const loop = (sections: ReelPlan['sections']): ReelPlan => ({ ...plan(sections), loop: true });
const song = { seconds: 120, bpm: 120 };
const l1 = reviewDirectorPlan({ plan: loop([{ move: 'cut', beats: 8 }, { move: 'black', beats: 6 }]), spans: [{ from: 0, to: 4 }, { from: 4, to: 7 }], song });
assert.ok(l1.some((x) => /goes to black/.test(x.issue)));
assert.ok(l1.some((x) => /14 beats: the song restarts mid-bar/.test(x.issue) && /12 or 16/.test(x.fix)));
assert.ok(reviewDirectorPlan({ plan: loop([{ move: 'cut', beats: 8 }, { move: 'hold', beats: 8, transition: 'dipToBlack' }]), spans: [{ from: 0, to: 4 }, { from: 4, to: 8 }], song }).some((x) => /reads as an ending/.test(x.issue)));
assert.ok(!reviewDirectorPlan({ plan: loop([{ move: 'velocity', beats: 8 }, { move: 'hold', beats: 8 }]), spans: [{ from: 0, to: 4 }, { from: 4, to: 8 }], song }).some((x) => /loop/.test(x.issue)));

console.log('songMap.verify: ok');
