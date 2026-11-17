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
// (six sections of cuts and holds: the plain rule fires too)
assert.deepEqual(v.map((x) => x.rule).sort(), ['beats', 'duplicate', 'length', 'must-use', 'plain', 'safe-zone', 'short-shot']);
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
// RS-1273 (1) useAll: #6, #8 are not cast in the good plan
const all = validatePlan({ ...base, plan: good, brief: { useAll: true } });
assert.deepEqual(all.map((x) => x.rule), ['must-use']);
assert.match(all[0]!.issue, /2 are not cast: #6, #8/);
assert.deepEqual(validatePlan({ ...base, plan: { ...good, sections: [...good.sections, { move: 'flash-cuts', beats: 2, clips: ['#6', '#8'] }] }, brief: { useAll: true } }).filter((x) => x.rule === 'must-use'), []);
assert.deepEqual(parseBrief({ useAll: true }), { useAll: true });
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

// The rules that were critique findings until 2026-11-10: plain, dark, bar, crop
const rulesOf = (plan: any, extra: Partial<ValidateInput> = {}) => validatePlan({ ...base, plan, ...extra }).map((x) => x.rule);
const four = (moves: string[]): any => ({ version: 1, ratio: '9:16', music: 'song', sections: moves.map((move, k) => ({ move, beats: 4, clips: [`#${k + 1}`] })) });
// plain: more than half of four or more sections; not for a shot list, a voiceover reel or a short reel
assert.deepEqual(rulesOf(four(['cut', 'hold', 'cut', 'zoom-punch'])), ['plain']);
assert.deepEqual(rulesOf(four(['cut', 'hold', 'velocity', 'zoom-punch'])), []);
assert.deepEqual(rulesOf(four(['cut', 'hold', 'cut'])), [], 'three sections');
assert.deepEqual(rulesOf({ ...four(['cut', 'hold', 'cut', 'hold']), shotList: true }), []);
assert.deepEqual(rulesOf({ ...four(['cut', 'hold', 'cut', 'hold']), voiceover: 'voice' }), []);
assert.deepEqual(validatePlan({ ...base, plan: four(['cut', 'hold', 'cut', 'zoom-punch']) })[0]!.sections, [0, 1, 2]);
// dark: the night clip of the 2026-11-07 runs (exposure 0.00 for its first 6 s, lit from 6 s); a start with no @ is the build's pick
const night = { assetId: 'a1', dHash: hashes[0]!, windows: [{ startFrame: 0, endFrame: 180, sharpness: 0.85, exposure: 0, motion: 0.2, subject: 0.1, speech: false }, { startFrame: 180, endFrame: 300, sharpness: 0.8, exposure: 0.7, motion: 0.2, subject: 0.1, speech: false }] };
const withNight = clips.map((c, i) => (i === 0 ? { ...c, features: night } : c));
const darkPlan: any = { version: 1, ratio: '9:16', music: 'song', sections: [{ move: 'zoom-punch', beats: 4, clips: ['#1@1', '#1@3'] }, { move: 'hold', beats: 4, clips: ['#2@0'] }] };
const dark = validatePlan({ ...base, clips: withNight, plan: darkPlan });
assert.deepEqual(dark.map((x) => x.rule), ['dark']);
assert.deepEqual(dark[0]!.sections, [0]);
assert.match(dark[0]!.issue, /#1@1 \(section 0, exposure 0\.00\): #1@6 is lit/);
assert.deepEqual(rulesOf({ ...darkPlan, sections: [{ move: 'zoom-punch', beats: 4, clips: ['#1@7', '#1'] }, darkPlan.sections[1]] }, { clips: withNight }), [], 'a lit moment, and a clip left to the build');
// RS-1270: a clip that is dark from end to end is night footage (the Goa club shots), not a mistake
const club = { assetId: 'a1', dHash: hashes[0]!, windows: [{ startFrame: 0, endFrame: 150, sharpness: 0.6, exposure: 0.1, motion: 0.4, subject: 0.1, speech: false }, { startFrame: 150, endFrame: 300, sharpness: 0.6, exposure: 0.14, motion: 0.4, subject: 0.1, speech: false }] };
assert.deepEqual(rulesOf(darkPlan, { clips: clips.map((c, i) => (i === 0 ? { ...c, features: club } : c)) }), [], 'a night clip with no lit moment is cast as it is');
assert.deepEqual(rulesOf({ ...darkPlan, shotList: true }, { clips: withNight }), [], 'a shot list is built as written');
// bar: 30 beats end mid-bar, 32 do not; a length the brief fixes that no bar meets wins; nothing without a song
const beatsPlan = (beats: number[]): any => ({ version: 1, ratio: '9:16', music: 'song', sections: beats.map((b, k) => ({ move: k % 2 ? 'zoom-punch' : 'cut', beats: b, clips: [`#${k + 1}@0`] })) });
const bar = validatePlan({ ...base, plan: beatsPlan([8, 8, 8, 6]) });
assert.deepEqual(bar.map((x) => x.rule), ['bar']);
assert.match(bar[0]!.fix, /28 or 32 beats/);
assert.deepEqual(rulesOf(beatsPlan([8, 8, 8, 8])), []);
assert.deepEqual(rulesOf(beatsPlan([8, 8, 8, 6]), { bpm: 60, brief: { seconds: 30 } }), [], '30 beats is the 30 s asked for; 28 and 32 are two seconds off');
assert.match(validatePlan({ ...base, plan: beatsPlan([8, 8, 8, 6]), brief: { maxSeconds: 15.5 } })[0]!.fix, /add up to 28 beats/);
assert.deepEqual(rulesOf({ ...beatsPlan([8, 8, 8, 6]), music: undefined }), []);
// crop: a landscape shot of people filling 9:16; not scenery, not in a window move, not with fit whole, not on a wide reel
const shaped = clips.map((c, i) => ({ ...c, shape: i < 2 ? 'landscape' as const : 'portrait' as const, people: i === 0 || i === 2 }));
const cropPlan = (section: any, ratio = '9:16'): any => ({ version: 1, ratio, music: 'song', sections: [section, { move: 'zoom-punch', beats: 4, clips: ['#4', '#5'] }] });
const crop = validatePlan({ ...base, clips: shaped, plan: cropPlan({ move: 'hold', beats: 4, clips: ['#1@2'] }) });
assert.deepEqual(crop.map((x) => x.rule), ['crop']);
assert.match(crop[0]!.fix, /fit: "whole"/);
assert.deepEqual(rulesOf(cropPlan({ move: 'hold', beats: 4, clips: ['#2@2'] }), { clips: shaped }), [], 'landscape scenery');
assert.deepEqual(rulesOf(cropPlan({ move: 'hold', beats: 4, clips: ['#3@2'] }), { clips: shaped }), [], 'portrait people');
assert.deepEqual(rulesOf(cropPlan({ move: 'hold', beats: 4, clips: ['#1@2'], fit: 'whole' }), { clips: shaped }), []);
assert.deepEqual(rulesOf(cropPlan({ move: 'split', beats: 4, clips: ['#1@2', '#3'] }), { clips: shaped }), []);
assert.deepEqual(rulesOf(cropPlan({ move: 'hold', beats: 4, clips: ['#1@2'] }, '16:9'), { clips: shaped }), []);

// RS-1271 (3) still: a long hold on a moment where nothing moves (IMG_2644, the Goa beach cafe: 0.15 from end to end)
{
  const cafe = { hz: 4, values: [0, 0.1, 0.11, 0.13, 0.18, 0.13, 0.15, 0.19, 0.2, 0.16, 0.14, 0.15, 0.14, 0.12, 0.14, 0.14, 0.15, 0.18, 0.15] };
  // #2 sits still for 3 s and then people move
  const mixed = { hz: 4, values: [0, ...Array(12).fill(0.05), ...Array(28).fill(0.4)] };
  const moving = clips.map((c, i) => ({ ...c, seconds: i === 0 ? 4.75 : c.seconds, features: { ...c.features, motionCurve: i === 0 ? cafe : i === 1 ? mixed : { hz: 4, values: [0, ...Array(40).fill(0.35)] } } }));
  const stillPlan = (section: any, tone?: string): any => ({ version: 1, ratio: '9:16', music: 'song', ...(tone ? { tone } : {}), sections: [{ move: 'zoom-punch', beats: 4, clips: ['#4', '#5'] }, section, { move: 'zoom-punch', beats: 4, clips: ['#6', '#7'] }] });
  const stillOnly = (plan: any, extra: Partial<ValidateInput>) => rulesOf(plan, extra).filter((r) => r === 'still');
  const held = validatePlan({ ...base, clips: moving, plan: stillPlan({ move: 'hold', beats: 8, clips: ['#1@1'] }) });
  assert.deepEqual(held.map((x) => x.rule), ['still']);
  assert.deepEqual(held[0]!.sections, [1]);
  assert.match(held[0]!.issue, /#1@1 \(section 1, 4 s, movement 0\.1\d\): the clip is still from end to end/);
  // a still start in a clip that moves later names where it moves
  const later = validatePlan({ ...base, clips: moving, plan: stillPlan({ move: 'hold', beats: 4, clips: ['#2@0.5'] }) });
  assert.match(later[0]!.issue, /#2@0\.5 .*: #2@\d+(\.\d+)? moves \(0\.40\)/);
  assert.deepEqual(stillOnly(stillPlan({ move: 'hold', beats: 4, clips: ['#2@4'] }), { clips: moving }), [], 'the moving stretch');
  assert.deepEqual(stillOnly(stillPlan({ move: 'hold', beats: 4, clips: ['#2'] }), { clips: moving }), [], 'no @: the build takes the moving stretch');
  assert.deepEqual(stillOnly(stillPlan({ move: 'hold', beats: 8, clips: ['#1'] }), { clips: moving }), ['still'], 'no @, but the clip never moves');
  assert.deepEqual(stillOnly(stillPlan({ move: 'hold', beats: 2, clips: ['#1@1'] }), { clips: moving }), [], 'a 1 s rest is not a freeze');
  assert.deepEqual(stillOnly(stillPlan({ move: 'cut', beats: 8, clips: ['#1@1', '#3'], params: { every: 2 } }), { clips: moving }), [], 'a 2-beat cut');
  assert.deepEqual(stillOnly(stillPlan({ move: 'cut', beats: 8, clips: ['#1@0.5', '#3'], params: { every: 4 } }), { clips: moving }), ['still'], 'a 4-beat cut');
  assert.deepEqual(stillOnly(stillPlan({ move: 'hold', beats: 8, clips: ['#1@1'] }, 'calm'), { clips: moving }), [], 'a calm reel holds still views');
}
// RS-1271 (2) copy: a line lifted from the brief, refused with "write the line"; quoted phrases and quoteUser pass
{
  const story = 'Goa trip with the boys: the red Thar road trip, beach cafes and the sea, pool jumps, and clubbing all night, end on "see you next year"';
  const lined: any = { ...good, sections: [{ ...good.sections[0], text: 'GOA TRIP WITH THE BOYS' }, good.sections[1], { ...good.sections[2], text: 'see you next year' }], overlays: [{ text: 'CLUBBING ALL NIGHT LONG', from: 1, to: 1 }] };
  const copy = validatePlan({ ...base, plan: lined, story });
  assert.deepEqual(copy.map((x) => x.rule), ['copy']);
  assert.deepEqual(copy[0]!.sections, [0, 1]);
  assert.match(copy[0]!.issue, /"GOA TRIP WITH THE BOYS" \(section 0\) copies "goa trip with the boys"; "CLUBBING ALL NIGHT LONG" \(section 1\) copies "clubbing all night"/);
  assert.match(copy[0]!.fix, /^write the line/);
  assert.deepEqual(validatePlan({ ...base, plan: lined, story, quoteUser: true }), []);
  assert.deepEqual(validatePlan({ ...base, plan: { ...lined, shotList: true }, story }).filter((x) => x.rule === 'copy'), []);
  assert.deepEqual(validatePlan({ ...base, plan: lined }), [], 'no story, no rule');
}

// RS-1271 (1) repeat: the last reel's moves again, refused once; another set passes
{
  const last = ['zoom-punch', 'cut', 'velocity', 'break-in', 'hold'];
  const plan: any = { version: 1, ratio: '9:16', sections: [{ move: 'velocity', beats: 8, clips: ['#1@0'] }, { move: 'zoom-punch', beats: 4, clips: ['#2', '#3'] }, { move: 'break-in', beats: 4, clips: ['#4@0', '#5@0'] }] };
  const rep = validatePlan({ ...base, plan, history: [last] });
  assert.deepEqual(rep.map((x) => x.rule), ['repeat']);
  assert.match(rep[0]!.issue, /\(break-in, velocity, zoom-punch\)/);
  assert.deepEqual(rulesOf(plan, { history: [last, ['split', 'pip']] }), []);
  assert.deepEqual(rulesOf(plan), []);
}

// RS-1272 (5) transition: into or out of a move with no full-frame shot at its cut it cannot play
{
  const tp = (transition: string | undefined, move = 'split'): any => ({ version: 1, ratio: '9:16', sections: [{ move: 'zoom-punch', beats: 4, clips: ['#1', '#2'] }, { move, beats: 4, clips: ['#3@0', '#4@0'], ...(transition ? { transition } : {}) }, { move: 'velocity', beats: 4, clips: ['#5@0'], transition: 'flash' }] });
  const tr = validatePlan({ ...base, plan: tp('zoom-through') });
  assert.deepEqual(tr.map((x) => x.rule), ['transition']);
  assert.deepEqual(tr[0]!.sections, [1, 2]);
  assert.match(tr[0]!.issue, /section 1's zoom-through \(zoom-punch → split\)/);
  assert.deepEqual(rulesOf(tp(undefined, 'hold')), []);
}

// RS-1271 (4) hook: the treatment's hook previews the car, the sea, the pool and the club; the plan's hook must too
{
  const parts = [{ clips: ['#1', '#3', '#5', '#7'] }, { clips: ['#1', '#2'] }, { clips: ['#3', '#4'] }, { clips: ['#5', '#6'] }, { clips: ['#7', '#8'] }];
  const hp = (hook: string[]): any => ({ version: 1, ratio: '9:16', sections: [{ move: 'zoom-punch', beats: 4, clips: hook }, { move: 'velocity', beats: 4, clips: ['#1@0'] }, { move: 'split', beats: 4, clips: ['#3@0', '#4@0'] }, { move: 'break-in', beats: 4, clips: ['#5@0', '#6@0'] }, { move: 'speed-ramp', beats: 4, clips: ['#7@0'] }] });
  const four = validatePlan({ ...base, plan: hp(['#1', '#2', '#1@4', '#2@5']), treatmentParts: parts });
  assert.deepEqual(four.map((x) => x.rule), ['hook']);
  assert.match(four[0]!.issue, /previews 4 later parts \(#1, #3, #5, #7\); the plan's hook shows 1 of them/);
  assert.deepEqual(rulesOf(hp(['#1@2', '#3@2', '#5@2', '#7@2']), { treatmentParts: parts }), []);
  assert.deepEqual(rulesOf(hp(['#1', '#2']), { treatmentParts: [{ clips: ['#1', '#2'] }, ...parts.slice(1)] }), [], 'a treatment hook that teases nothing');
}
// RS-1271 (5) group: "the boys" and no group shot in the hook or the ending
{
  const grouped = clips.map((c) => ({ ...c, group: c.n === 6 || c.n === 7 }));
  const gp = (end: string): any => ({ version: 1, ratio: '9:16', sections: [{ move: 'zoom-punch', beats: 4, clips: ['#1', '#2'] }, { move: 'velocity', beats: 4, clips: ['#3@0'] }, { move: 'speed-ramp', beats: 4, clips: [end] }] });
  const g = validatePlan({ ...base, clips: grouped, plan: gp('#4@0'), story: 'Goa trip with the boys' });
  assert.deepEqual(g.map((x) => x.rule), ['group']);
  assert.match(g[0]!.issue, /names "boys"/);
  assert.match(g[0]!.fix, /#6, #7/);
  assert.deepEqual(rulesOf(gp('#7@0'), { clips: grouped, story: 'Goa trip with the boys' }), []);
  assert.deepEqual(rulesOf(gp('#4@0'), { clips: grouped, story: 'a solo trek' }), []);
  assert.deepEqual(rulesOf(gp('#4@0'), { story: 'Goa trip with the boys' }), [], 'untagged clips: nothing to ask for');
}

console.log('validatePlan.verify: ok');
