import assert from 'node:assert/strict';
import { parseBrief, sectionTimes, validatePlan, violationText, type ValidateInput } from './validatePlan';

// eight clips of 10 s; #7 and #8 are the same picture (one bit apart), the rest far apart
const hashes = ['0000000000000000', 'ffffffffffffffff', '0f0f0f0f0f0f0f0f', 'f0f0f0f0f0f0f0f0', '00ff00ff00ff00ff', 'ff00ff00ff00ff00', '3333333333333333', '3333333333333332'];
const clips = hashes.map((dHash, i) => ({ n: i + 1, seconds: i === 5 ? 2 : 10, features: { assetId: `a${i + 1}`, dHash, windows: [] } }));
const clipNumber = (ref: string) => { const m = /^#(\d+)/.exec(ref); return m ? Number(m[1]) : /^a(\d+)/.test(ref) ? Number(ref.slice(1).split('@')[0]) : undefined; };
const base = { clips, clipNumber, bpm: 120 } satisfies Omit<ValidateInput, 'plan'>;
const brief = parseBrief({ seconds: 8, songFrom: 45, songTo: 53, mustUse: ['#3', ' '], junk: 1 })!;
assert.deepEqual(brief, { seconds: 8, songFrom: 45, songTo: 53, mustUse: ['#3'] });
assert.equal(parseBrief({}), undefined);

// a plan that follows every rule: 16 beats at 120 BPM = 8 s from 45 s, #3 cast, half-beat shots only in the flash run,
// the line placed in the middle, no moment twice
const good: any = {
  version: 1, ratio: '9:16', music: 'song', musicStart: 45, sections: [
    { move: 'cut', beats: 8, clips: ['#1@0', '#2@0', '#3@2', '#1@6'] },
    { move: 'flash-cuts', beats: 4, clips: ['#4', '#5'] },
    { move: 'hold', beats: 4, clips: ['#7'], text: 'the top', params: { y: 0.5 } },
  ],
};
assert.deepEqual(validatePlan({ ...base, plan: good, brief }), []);
assert.deepEqual(sectionTimes(good, 0.5).map((t) => t.endBeat), [8, 12, 16]);

// one plan breaking each rule returns exactly one violation per rule
const bad: any = {
  version: 1, ratio: '9:16', music: 'song', sections: [
    { move: 'cut', seconds: 1.3, clips: ['#1@0'] }, // off the beat (2.5 beats)
    { move: 'cut', beats: 4, clips: ['#2', '#4'], params: { every: 0.5 } }, // 0.25 s shots outside a flash run
    { move: 'hold', beats: 4, clips: ['#1@0.4'], text: 'the top', params: { y: 0.05 } }, // the same moment as section 0, under the header
    { move: 'hold', beats: 4, clips: ['#7'] }, { move: 'hold', beats: 4, clips: ['#8'] }, // near-identical clips
  ],
};
const v = validatePlan({ ...base, plan: bad, brief });
assert.deepEqual(v.map((x) => x.rule).sort(), ['beats', 'duplicate', 'length', 'must-use', 'safe-zone', 'short-shot']);
const by = Object.fromEntries(v.map((x) => [x.rule, x]));
assert.match(by.length!.issue, /brief asks for 8 s/);
assert.match(by.length!.issue, /names 45 s/);
assert.match(by.length!.fix, /musicStart to 45/);
assert.deepEqual(by.beats!.sections, [0, 1]);
assert.deepEqual(by['short-shot']!.sections, [1]);
assert.match(by['short-shot']!.issue, /0\.25 s/);
assert.match(by['must-use']!.issue, /#3/);
assert.deepEqual(by['safe-zone']!.sections, [2]);
assert.match(by.duplicate!.issue, /#1@0 \(section 0\) and #1@0\.4 \(section 2\)/);
assert.match(by.duplicate!.issue, /#7 \(section 3\) and #8 \(section 4\) look the same/);
for (const x of v) assert.ok(violationText(x).startsWith(`[${x.rule}] `));

// details of each rule
// length: "under 20 s" and the song window alone
assert.deepEqual(validatePlan({ ...base, plan: good, brief: { maxSeconds: 7.5 } }).map((x) => x.rule), ['length']);
assert.deepEqual(validatePlan({ ...base, plan: good, brief: { songTo: 60 } }).map((x) => x.rule), ['length']); // 45..60 is 15 s
assert.deepEqual(validatePlan({ ...base, plan: good, brief: { songTo: 53.4 } }), []); // within a beat
// beats: none without a song, and none for the user's own shot list
assert.ok(!validatePlan({ ...base, plan: { ...bad, music: undefined } }).some((x) => x.rule === 'beats'));
assert.ok(!validatePlan({ ...base, plan: { ...bad, shotList: true } }).some((x) => x.rule === 'beats' || x.rule === 'short-shot'));
// a whole-beat seconds section is on the beat; a fractional every outside a flash run is not
assert.deepEqual(validatePlan({ ...base, plan: { ...good, sections: [{ move: 'cut', seconds: 4, clips: ['#3@0'] }, ...good.sections.slice(1)] } }), []);
assert.deepEqual(validatePlan({ ...base, plan: { ...good, sections: [{ move: 'cut', beats: 6, clips: ['#3@0'], params: { every: 1.5 } }] } }).map((x) => x.rule), ['beats']);
// short-shot: a one-beat cut at 140 BPM is under 0.5 s; at 120 BPM it is exactly 0.5 s; zoom-punch is a burst
const oneBeat: any = { ...good, sections: [{ move: 'cut', beats: 4, clips: ['#3@0'], params: { every: 1 } }] };
assert.deepEqual(validatePlan({ ...base, bpm: 140, plan: oneBeat }).map((x) => x.rule), ['short-shot']);
assert.deepEqual(validatePlan({ ...base, plan: oneBeat }), []);
assert.deepEqual(validatePlan({ ...base, bpm: 140, plan: { ...oneBeat, sections: [{ move: 'zoom-punch', beats: 4, clips: ['#3', '#4'] }] } }), []);
// must-use: a pinned moment must be cast near it; an assetId works as well as a number
assert.deepEqual(validatePlan({ ...base, plan: good, brief: { mustUse: ['#3@2.5', 'a4'] } }), []);
assert.deepEqual(validatePlan({ ...base, plan: good, brief: { mustUse: ['#3@9'] } }).map((x) => x.rule), ['must-use']);
assert.deepEqual(validatePlan({ ...base, plan: good, brief: { mustUse: ['#99'] } }).map((x) => x.rule), ['must-use']);
// safe-zone: the right-side buttons, an overlay, and a 16:9 reel (no overlay there); a style's own place (-1) is not checked
assert.deepEqual(validatePlan({ ...base, plan: { ...good, overlays: [{ text: 'day 1', style: 'caption', from: 0, to: 1, params: { x: 0.95 } }] } }).map((x) => x.rule), ['safe-zone']);
assert.deepEqual(validatePlan({ ...base, plan: { ...good, ratio: '16:9', sections: [{ ...good.sections[0], text: 'hi', params: { y: 0.02 } }, ...good.sections.slice(1)] } }), []);
assert.deepEqual(validatePlan({ ...base, plan: { ...good, sections: [...good.sections.slice(0, 2), { ...good.sections[2], params: { x: -1, y: -1 } }] } }), []);
// duplicate: the same short clip twice without @ is the same shot; a long one is not (the cast picks two moments)
assert.deepEqual(validatePlan({ ...base, plan: { ...good, sections: [...good.sections, { move: 'hold', beats: 2, clips: ['#6'] }, { move: 'hold', beats: 2, clips: ['#6'] }] } }).filter((x) => x.rule === 'duplicate').length, 1);
assert.ok(!validatePlan({ ...base, plan: { ...good, sections: [...good.sections, { move: 'hold', beats: 2, clips: ['#5'] }] } }).some((x) => x.rule === 'duplicate'));

console.log('validatePlan.verify: ok');
