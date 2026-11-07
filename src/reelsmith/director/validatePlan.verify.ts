import assert from 'node:assert/strict';
import { parseBrief, reelPhraseBeats, sectionTimes, validatePlan, violationText, type ValidateInput } from './validatePlan';

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
    { move: 'cut', seconds: 1.3, clips: ['#5@0'] }, // off the beat (2.5 beats)
    { move: 'cut', beats: 4, clips: ['#2', '#4'], params: { every: 0.5 } }, // 0.25 s shots outside a flash run
    { move: 'hold', beats: 4, clips: ['#1@0'], text: 'the top', params: { y: 0.05 } }, // under the header
    { move: 'hold', beats: 4, clips: ['#1@0.4'] }, // the same moment as section 2
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
assert.match(by.duplicate!.issue, /#1@0 \(section 2\) and #1@0\.4 \(section 3\)/);
assert.match(by.duplicate!.issue, /#7 \(section 4\) and #8 \(section 5\) look the same/);
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
// the bounds the fix states are the bounds it checks: y 0.16 (the stated minimum on 9:16) passes, 0.15 does not
const yAt = (y: number) => validatePlan({ ...base, plan: { ...good, sections: [...good.sections.slice(0, 2), { ...good.sections[2], params: { y } }] } }).filter((x) => x.rule === 'safe-zone');
assert.equal(yAt(0.16).length, 0);
assert.match(yAt(0.15)[0]!.fix, /y 0\.16-0\.78/);
// duplicate: the same short clip twice without @ is the same shot; a long one is not (the cast picks two moments)
assert.deepEqual(validatePlan({ ...base, plan: { ...good, sections: [...good.sections, { move: 'hold', beats: 2, clips: ['#6'] }, { move: 'hold', beats: 2, clips: ['#6'] }] } }).filter((x) => x.rule === 'duplicate').length, 1);
assert.ok(!validatePlan({ ...base, plan: { ...good, sections: [...good.sections, { move: 'hold', beats: 2, clips: ['#5'] }] } }).some((x) => x.rule === 'duplicate'));
// what real runs did on purpose is not a repeat (replayed from 46 director runs): a recap of earlier shots, a moment
// flashed in a burst and then held, the opening previewing a later shot (cold open, loop), shots stepped through one take
const dupOf = (sections: any[], n = clips) => validatePlan({ ...base, clips: n, plan: { ...good, sections } }).filter((x) => x.rule === 'duplicate');
assert.equal(dupOf([{ move: 'hold', beats: 4, clips: ['#2@1'] }, { move: 'hold', beats: 4, clips: ['#3@5'] }, { move: 'cards-finale', beats: 12, clips: ['#3@5', '#4@1'] }]).length, 0, 'a recap');
assert.equal(dupOf([{ move: 'hold', beats: 4, clips: ['#2@1'] }, { move: 'flash-cuts', beats: 2, clips: ['#4@2', '#3@5'] }, { move: 'hold', beats: 4, clips: ['#3@5'] }]).length, 0, 'burst then hold');
assert.equal(dupOf([{ move: 'hold', beats: 4, clips: ['#3@5'] }, { move: 'cut', beats: 8, clips: ['#1@0', '#2@0'] }, { move: 'hold', beats: 4, clips: ['#3@5'] }]).length, 0, 'the opening');
assert.equal(dupOf([{ move: 'hold', beats: 4, clips: ['#2@1'] }, { move: 'cut', beats: 4, clips: ['#1@0.3', '#1@0.9', '#1@1.5', '#1@2.1'], params: { every: 1 } }]).length, 0, 'stepped through one take');
assert.equal(dupOf([{ move: 'hold', beats: 4, clips: ['#2@1'] }, { move: 'hold', beats: 4, clips: ['#3@5'] }, { move: 'hold', beats: 4, clips: ['#3@5.5'] }]).length, 1, 'two holds of one moment');
assert.equal(dupOf([{ move: 'hold', beats: 4, clips: ['#2@1'] }, { move: 'hold', beats: 4, clips: ['#3@5'] }, { move: 'hold', beats: 4, clips: ['#3@5.5'] }], clips.slice(0, 3)).length, 0, 'three clips cannot fill a reel without repeats');

// RS-1268 phrase: the 2026-11-07 trek reel. A 107 BPM song (first strong beat at 0.116 s) started at 1:05, the nearest
// beat being song beat 116, four beats into a phrase: its 4-bar phrases begin on reel beats 12 and 28. The build put
// the titles on beats 4, 12 and 24.
const song = { beatTimesSec: Array.from({ length: 535 }, (_, i) => 0.116 + i * 60 / 107), downbeatIndex: 0, beatsPerBar: 4 };
const start = song.beatTimesSec[116]!;
assert.deepEqual(reelPhraseBeats(song, start, 32).phrases, [12, 28]);
assert.deepEqual(reelPhraseBeats(song, 'firstDownbeat', 32).phrases, [0, 16, 32]);
assert.deepEqual(reelPhraseBeats(song, start - 0.2, 32).phrases, [13, 29], 'a start before the beat: that beat is reel beat 1, as the build counts it');
const trek = (beats: number[], drop?: number): any => ({ version: 1, ratio: '9:16', music: 'song', musicStart: start, sections: beats.map((b, k) => ({ move: 'cut', beats: b, clips: [`#${k + 1}@0`], text: `part ${k}` })) });
const phraseOf = (plan: any, grid: any = song) => validatePlan({ ...base, bpm: 107, plan, songGrid: grid }).filter((x) => x.rule === 'phrase');
const built = phraseOf(trek([4, 8, 12, 8]));
assert.equal(built.length, 1);
assert.deepEqual(built[0]!.sections, [1, 3], 'beats 4 and 24 miss; beat 12 is a phrase');
assert.match(built[0]!.issue, /reel beats 12, 28/);
assert.deepEqual(phraseOf(trek([12, 16, 4])), [], 'titles on beats 12 and 28');
assert.deepEqual(phraseOf({ ...trek([12, 16, 4]), sections: [...trek([12, 16, 4]).sections.slice(0, 2), { move: 'cut', beats: 4, clips: ['#3@0'] }, { move: 'cut', beats: 4, clips: ['#4@0'], text: '' }] }), [], 'an untitled section is no scene change');
assert.deepEqual(phraseOf(trek([12, 8, 12]), { ...song, dropSec: song.beatTimesSec[136] }), [], 'the drop (reel beat 20) is a place for a big change');
assert.deepEqual(validatePlan({ ...base, bpm: 107, plan: trek([4, 8, 12, 8]) }).filter((x) => x.rule === 'phrase'), [], 'no grid, no phrase rule');
assert.deepEqual(phraseOf({ ...trek([4, 8, 12, 8]), music: undefined }), [], 'no song, no phrase rule');

console.log('validatePlan.verify: ok');
