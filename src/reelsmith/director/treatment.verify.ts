import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TONE_KIT, TONES, checkTreatment, parseTreatment, treatmentIds, type Treatment } from './treatment';
import { catalogKind, catalogSlice } from './catalogText';
import { brandAction, brandWords, parseBrandHtml } from '../../../shared/reelsmith/brandKit';
import { critiqueFrames, critiquePlan, criticBrief } from './critique';
import type { ShotLogClip } from './shotLog';
import type { WindowFeatures } from '../assembler/scoring';

// every id the tone table names is in the catalogue (a typo would never match a plan)
for (const tone of TONES) for (const id of [...TONE_KIT[tone].prefer, ...TONE_KIT[tone].avoid]) assert.ok(catalogKind(id), `${tone}: ${id} is not in the catalogue`);

// the skill's example treatment parses, needs no fixes, and its kit's entries fit well under the 16k result cap
const skill = readFileSync(new URL('../../agent/skills/reels-director/references/examples.md', import.meta.url), 'utf8');
const example = parseTreatment(JSON.parse(/```json treatment\n([\s\S]*?)```/.exec(skill)![1]!));
assert.ok(example.ok, example.ok ? '' : example.errors.join('; '));
const ex = example.treatment;
const fps = 30;
const win = (from: number, motion: number): WindowFeatures => ({ startFrame: from * fps, endFrame: (from + 2) * fps, sharpness: 0.6, exposure: 0.9, motion, subject: 0.2, speech: false });
const clip = (n: number, motion: number): ShotLogClip => ({ n, kind: 'video', seconds: 20, features: { assetId: `a${n}`, dHash: '0', windows: Array.from({ length: 10 }, (_, i) => win(i * 2, motion)) } });
// #9 is the still selfie of the AMK run; the rest move
const clips = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => clip(n, 0.3)).concat([clip(9, 0.01), clip(10, 0.01), clip(11, 0.01)]);
const song = { bpm: 130, beatsFor18s: 40, dropAtBeat: 10 };
assert.deepEqual(checkTreatment(ex, { clips, fps, song }), [], 'the example treatment is clean');
const slice = catalogSlice(treatmentIds(ex));
assert.ok(slice.includes('`velocity`') && slice.includes('slow=') && slice.includes('`shine`'), 'the slice carries full entries with params');
assert.ok(slice.length < 10_000, `slice is ${slice.length} characters`);

// what went wrong in the first AMK run (2026-10-21), as a treatment: an 8-beat hold on a still selfie under a 9-word line,
// plain moves, no transitions, slam and sparkles on a feat the user wanted royal
const amk: Treatment = {
  ...ex, tone: 'royal', textStyles: ['caption', 'rise-lines', 'slam'], transitions: [], effects: ['zoom-blur', 'sparkle'], graphics: ['annotate', 'confetti'],
  parts: [
    { role: 'hook', beats: 8, move: 'hold', clips: ['#9@1.5'], line: 'bro lied to me that it would be easy hike' },
    { role: 'drop', beats: 8, move: 'velocity', clips: ['#2'], line: 'but instead took me to hardest hike in Maharashtra' },
    { role: 'payoff', beats: 4, move: 'hold', clips: ['#3@1'], line: 'AMK' },
    { role: 'journey', beats: 6, move: 'cut', clips: ['#4', '#1@4'] },
    { role: 'ending', beats: 8, move: 'hold', clips: ['#8@2'], line: '2 days full of epic adventure' },
  ],
};
const f = checkTreatment(amk, { clips, fps, song });
const has = (re: RegExp) => assert.ok(f.some((x) => re.test(x.issue)), `expected a finding matching ${re}: ${f.map((x) => x.issue).join(' | ')}`);
has(/caption, slam, sparkle, confetti fight the royal tone/);
has(/plain cuts or holds/);
has(/no transitions/);
has(/hook is 3\.7 s of one hold/);
has(/hook line is 10 words/);
has(/hook holds a still moment \(#9@1\.5\)/);
has(/drop is beat 10.*inside part 1 \(velocity\)/);
has(/words the user did not write: epic/);
assert.ok(f.find((x) => /still moment/.test(x.issue))!.fix.includes('#1'), 'suggests clips that move');
// this run's opener (2026-10-21, pipeline run 1): a hold on the selfie, then a hold on the cliff
assert.ok(checkTreatment({ ...ex, parts: [{ ...ex.parts[0]!, move: 'hold', clips: ['#1'] }, { ...ex.parts[1]! }, ...ex.parts.slice(2)] }, { clips, fps, song }).some((x) => /parts 0 and 1 are both hold/.test(x.issue)));
assert.ok(critiquePlan({ version: 1, ratio: '9:16', sections: [{ move: 'hold', clips: ['a'] }, { move: 'hold', clips: ['b'] }, { move: 'velocity', clips: ['c'] }] } as never, [{ from: 0, to: 2 }, { from: 2, to: 4 }, { from: 4, to: 8 }]).some((x) => /both hold/.test(x.issue)));
// a funny tone welcomes the caption and confetti it rejected for royal
assert.ok(!checkTreatment({ ...amk, tone: 'funny' }, { clips, fps, song }).some((x) => /fight/.test(x.issue)));
// the story names bro: with no arrow, tag or freeze-intro it is flagged
assert.ok(checkTreatment({ ...ex, graphics: [] }, { clips, fps, song }).some((x) => /names "bro"/.test(x.issue)));
// unknown ids are named; without a song or a shot log nothing throws
assert.ok(checkTreatment({ ...ex, effects: ['zoom-blurr'] }, { clips: [], fps }).some((x) => /zoom-blurr/.test(x.issue)));

// parsing: the treatment must decide (two concepts, a tone, an arc, a signature)
const bad = parseTreatment({ story: 'x', concepts: [{ name: 'a', idea: 'b' }], tone: 'grand', parts: [{ move: 'cut', beats: 4 }] });
assert.ok(!bad.ok && bad.errors.some((e) => /two different concepts/.test(e)) && bad.errors.some((e) => /tone/.test(e)) && bad.errors.some((e) => /three parts/.test(e)) && bad.errors.some((e) => /signature/.test(e)));

// the critique of the AMK run's sixth plan (the one the user called "basic", then "childish")
const plan: any = { version: 1, ratio: '9:16', sections: [
  { move: 'hold', clips: ['a'], text: 'bro lied to me that it would be easy hike', textStyle: 'highlight' },
  { move: 'velocity', clips: ['b'], text: 'but instead took me to hardest hike in Maharashtra', textStyle: 'rise-lines' },
  { move: 'hold', clips: ['c'], text: 'AMK', textStyle: 'location-tag' },
  { move: 'cut', clips: ['d', 'e'], effects: [{ id: 'rgb-split', timing: 'beat' }] },
  { move: 'hold', clips: ['f'], text: '2 days full of adventure', textStyle: 'slam' },
], graphics: [{ graphic: 'confetti', from: 4 }] };
const spans = [{ from: 0, to: 3.7 }, { from: 3.7, to: 7.4 }, { from: 7.4, to: 9.2 }, { from: 9.2, to: 12 }, { from: 12, to: 15.7 }];
const c = critiquePlan(plan, spans, { ...ex, tone: 'royal' });
assert.ok(c.some((x) => /highlight, rgb-split, slam, confetti fight the royal tone/.test(x.issue)), c.map((x) => x.issue).join(' | '));
assert.ok(c.some((x) => /4 of 5 sections are plain/.test(x.issue)));
assert.ok(c.some((x) => /hard cut/.test(x.issue)));
assert.ok(c.some((x) => /opens on 3\.7 s of one hold/.test(x.issue)));
// the example plan in the skill passes the critique
const examplePlan = JSON.parse(/```json\n([\s\S]*?)```/.exec(skill)![1]!);
const exSpans = examplePlan.sections.map((s: { beats: number }, i: number, all: Array<{ beats: number }>) => {
  const from = all.slice(0, i).reduce((t, x) => t + x.beats * 60 / 130, 0);
  return { from, to: from + s.beats * 60 / 130 };
});
assert.deepEqual(critiquePlan(examplePlan, exSpans, ex), [], 'the example plan is clean');

// critic frames: three a section, each line at its fullest, never two within a quarter second, within budget
const frames = critiqueFrames(plan, spans, fps);
assert.equal(frames.filter((x) => /line/.test(x.label)).length, 4);
assert.ok(frames.every((x, i) => i === 0 || x.frame - frames[i - 1]!.frame >= fps * 0.25));
assert.ok(frames.length >= 12 && frames.length <= 24);
const long: any = { ...plan, sections: Array.from({ length: 14 }, (_, i) => ({ move: 'cut', clips: ['a'], ...(i % 2 ? { text: `line ${i}` } : {}) })) };
const many = critiqueFrames(long, Array.from({ length: 14 }, (_, i) => ({ from: i * 2, to: i * 2 + 2 })), fps);
assert.ok(many.length <= 24 && many.filter((x) => /line/.test(x.label)).length === 7, 'over budget: lines and middles kept');
assert.match(criticBrief(ex), /royal/);
console.log('treatment: ok');

// RS-1218: a part with no purpose, or the same purpose as the part before, is filler
const noPurpose = checkTreatment({ ...ex, parts: ex.parts.map((p, i) => (i === 3 ? { ...p, purpose: undefined } : p)) }, { clips, fps, song });
assert.ok(noPurpose.some((x) => /part 3 has no purpose/.test(x.issue)), noPurpose.map((x) => x.issue).join(' | '));
const twin = checkTreatment({ ...ex, parts: ex.parts.map((p, i) => (i === 4 ? { ...p, purpose: 'the scale of the climb, again' } : p)) }, { clips, fps, song });
assert.ok(twin.some((x) => /parts 3 and 4 have the same purpose/.test(x.issue)), twin.map((x) => x.issue).join(' | '));
assert.ok(!checkTreatment(ex, { clips, fps, song }).some((x) => /purpose/.test(x.issue)), 'the example gives every part its own purpose');

// RS-1221: the story names a waterfall; the tagged clips show hills and people, so the agent asks instead of faking it
const tags = (top: string, water = 0.01) => ({ top, confidence: 0.6, samples: 4, scores: { scenery: 0.4, people: 0.3, water } as never }) as never;
const tagged = clips.map((c) => ({ ...c, tags: tags('scenery') }));
const falls = checkTreatment({ ...ex, story: `${ex.story} and swam under a waterfall` }, { clips: tagged, fps, song });
const ask = falls.find((x) => /names "waterfall" and no clip seems to show it/.test(x.issue));
assert.ok(ask?.ask && /waterfall.*Is it in one of them/.test(ask.ask), falls.map((x) => x.issue).join(' | '));
// one clip with water in it is enough; untagged footage is not judged
assert.ok(!checkTreatment({ ...ex, story: `${ex.story} waterfall` }, { clips: tagged.map((c, i) => (i === 2 ? { ...c, tags: tags('water', 0.5) } : c)), fps, song }).some((x) => x.ask));
assert.ok(!checkTreatment({ ...ex, story: `${ex.story} waterfall` }, { clips, fps, song }).some((x) => x.ask));

// RS-1239: a promo reel (Kino's 2026-11-01 Pune Trekkers run): the page's words are the user's, and it ends asking
const kit = parseBrandHtml(`<title>Pune Trekkers | Find your people</title><meta name="description" content="Free, volunteer-run treks.">
  <h1>FIND YOUR PEOPLE. FIND YOUR TRAIL.</h1><p>2,300+ trekkers and counting</p><a href="https://chat.whatsapp.com/x">Join free on WhatsApp</a>`, 'https://punetrekkers.org/');
const brand = { name: kit.name, words: brandWords(kit), action: brandAction(kit) };
const promo: Treatment = { ...ex, story: 'promo reel for our trekking group', graphics: [], parts: ex.parts.map((p, i) => (i === 0 ? { ...p, line: 'find your trail' } : i === 2 ? { ...p, line: '2,300+ trekkers' } : i === 5 ? { ...p, line: 'join free on whatsapp' } : { ...p, line: undefined })) };
const pf = checkTreatment(promo, { clips, fps, song, brand });
assert.ok(!pf.some((x) => /did not write/.test(x.issue)), pf.map((x) => x.issue).join(' | '));
assert.ok(pf.some((x) => /promo reel for Pune Trekkers with no end card/.test(x.issue) && /Join free on WhatsApp/.test(x.fix)), pf.map((x) => x.issue).join(' | '));
assert.ok(pf.some((x) => /nothing names Pune Trekkers/.test(x.issue)));
assert.ok(!checkTreatment({ ...promo, graphics: ['cta-card', 'handle-tag'] }, { clips, fps, song, brand }).some((x) => /end card|nothing names/.test(x.issue)));
// without the kit, the same lines are words the user did not write
assert.ok(checkTreatment(promo, { clips, fps, song }).some((x) => /did not write/.test(x.issue)));
// a hook with no words, when there is a story to quote
assert.ok(checkTreatment({ ...ex, parts: ex.parts.map((p, i) => (i === 0 ? { ...p, line: undefined } : p)) }, { clips, fps, song }).some((x) => /hook has no words/.test(x.issue)));
// RS-1240: clock times from the clips' own metadata count as theirs
assert.ok(!checkTreatment({ ...ex, parts: ex.parts.map((p, i) => (i === 1 ? { ...p, line: '4:12 am' } : p)) }, { clips, fps, song, clock: true }).some((x) => /did not write: am/.test(x.issue)));
console.log('treatment promo: ok');

// RS-1243: a promo is copywriting (Kino's cut beat ours with lines of its own), but no invented numbers, a line on every
// part, and about 27 s
{
  const lines = ['STOP WASTING YOUR *WEEKENDS* IN PUNE.', 'DO *THIS* INSTEAD.', 'LEGS: DEAD. MOOD: *ELITE*.', '*2,300+* STRANGERS.', 'AND IT\'S *FREE* TO JOIN.', ''];
  const copy: Treatment = { ...promo, graphics: ['cta-card', 'handle-tag'], parts: ex.parts.map((p, i) => ({ ...p, beats: p.beats * 1.5, line: lines[i] || undefined })) };
  const cf = checkTreatment(copy, { clips, fps, song, brand });
  assert.ok(!cf.some((x) => /did not write|numbers|no line|the arc is/.test(x.issue)), cf.map((x) => x.issue).join(' | '));
  const invented = checkTreatment({ ...copy, parts: copy.parts.map((p, i) => (i === 3 ? { ...p, line: '5,000 TREKKERS' } : p)) }, { clips, fps, song, brand });
  assert.ok(invented.some((x) => /numbers the page and the user never gave: 5,000/.test(x.issue)), invented.map((x) => x.issue).join(' | '));
  const bare = checkTreatment({ ...copy, parts: copy.parts.map((p, i) => (i === 2 ? { ...p, line: undefined } : p)) }, { clips, fps, song, brand });
  assert.ok(bare.some((x) => /part 2 carries no line/.test(x.issue)));
  assert.ok(checkTreatment(promo, { clips, fps, song, brand }).some((x) => /the arc is 40 beats.*/.test(x.issue) && /about 27 s/.test(x.fix ?? '') || /aim near 60 beats/.test(x.fix)));
  console.log('treatment promo copy: ok');
}
