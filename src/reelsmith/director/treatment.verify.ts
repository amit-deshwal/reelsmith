import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TONE_KIT, TONES, checkTreatment, isShotList, parseTreatment, treatmentIds, type Treatment } from './treatment';
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

// RS-1245: the agent's promo of 2026-11-02: a one-shot hook, eleven 4-beat parts, a big line over a split grid
{
  const flat: Treatment = { ...ex, tone: 'hype', textStyles: ['punch-caps'], graphics: ['cta-card', 'handle-tag'], parts: [
    { role: 'hook', beats: 4, move: 'hold', clips: ['#2@11'], line: 'STOP WASTING *WEEKENDS*.', purpose: 'the dare' },
    ...Array.from({ length: 6 }, (_, i) => ({ role: 'journey' as const, beats: 4, move: i % 2 ? 'cut' : 'zoom-punch', clips: ['#1', '#3'], line: `LINE ${i}`, purpose: `beat ${i}` })),
    { role: 'payoff', beats: 4, move: 'split', clips: ['#1', '#2', '#8'], line: '*~2,300* TREKKERS.', purpose: 'proof' },
    { role: 'ending', beats: 12, move: 'black', purpose: 'the ask' },
  ] };
  const ff = checkTreatment(flat, { clips, fps, song: { bpm: 124, beatsFor18s: 36 } });
  const has2 = (re: RegExp) => assert.ok(ff.some((x) => re.test(x.issue)), `${re}: ${ff.map((x) => x.issue).join(' | ')}`);
  has2(/the hook is 1 shot of hold for 1\.9 s in a hype reel/);
  has2(/8 of 9 parts are 4 beats long/);
  has2(/part 7 puts a big line over a multi-picture move \(split\)/);
  // a burst hook, varied lengths and a clean shot under the line pass
  const good: Treatment = { ...flat, parts: flat.parts.map((p, i) => (i === 0 ? { ...p, move: 'flash-cuts', clips: ['#7', '#9', '#8', '#7@14', '#5'] } : i === 7 ? { ...p, move: 'zoom-punch', beats: 8 } : i % 2 ? { ...p, beats: 2 } : p)) };
  assert.ok(!checkTreatment(good, { clips, fps, song: { bpm: 124, beatsFor18s: 36 } }).some((x) => /hook is|metronome|multi-picture/.test(x.issue)));
  // a calm reel may open on one held shot
  assert.ok(!checkTreatment({ ...flat, tone: 'calm', textStyles: ['rise-lines'] }, { clips, fps, song: { bpm: 124, beatsFor18s: 36 } }).some((x) => /hook is/.test(x.issue)));
  console.log('treatment rhythm: ok');
}

// RS-1247: the Torna promo of 2026-11-02 (no song): fast from the first frame to the card, flash-cuts and four
// zoom-punch parts, so the drop at the top hit no harder than the climb
{
  const torna: Treatment = { ...ex, tone: 'epic', textStyles: ['punch-caps'], graphics: ['cta-card'], parts: [
    { role: 'hook', beats: 4, move: 'zoom-punch', clips: ['#1', '#2', '#3', '#5'], line: 'NOBODY TOLD US', purpose: 'the hook' },
    { role: 'journey', beats: 6, move: 'cut', clips: ['#1', '#3', '#2', '#7'], line: '4 AM · *PUNE*', purpose: 'the start' },
    { role: 'build', beats: 6, move: 'zoom-punch', clips: ['#5', '#7', '#9'], line: '*CLIMB*', purpose: 'the effort' },
    { role: 'drop', beats: 4, move: 'flash-cuts', clips: ['#8', '#9', '#1', '#2'], line: 'AT THE *TOP*', purpose: 'release' },
    { role: 'peak', beats: 6, move: 'zoom-punch', clips: ['#3', '#5'], line: '*VIEWS*', purpose: 'the views' },
    { role: 'payoff', beats: 4, move: 'flash-cuts', clips: ['#7', '#8'], line: '*TEMPLE*', purpose: 'the temple' },
    { role: 'ending', beats: 8, move: 'black', purpose: 'the ask' },
  ] };
  const many = Array.from({ length: 20 }, (_, i) => ({ ...clips.find((c) => c.kind === 'video')!, n: 100 + i }));
  const brand = { name: 'Pune Trekkers', words: 'free trekking group in Pune' };
  const tf = checkTreatment(torna, { clips: [...clips, ...many], fps, brand });
  const has3 = (re: RegExp, field: 'issue' | 'fix' = 'issue') => assert.ok(tf.some((x) => re.test(x[field])), `${re}: ${tf.map((x) => x.issue).join(' | ')}`);
  has3(/2 parts are flash-cuts/);
  has3(/5 of 7 parts are punch moves/);
  has3(/before the drop \(parts 1-2\) a shot lasts 0\.9 s/);
  has3(/the arc is 38 beats \(19\.0 s\)/);
  has3(/aim near 72 beats \(about 36 s\)/, 'fix');
  // a slow build into one fast drop passes
  const built: Treatment = { ...torna, parts: [
    { ...torna.parts[0]! },
    { ...torna.parts[1]!, beats: 12, clips: ['#1', '#3'] },
    { ...torna.parts[2]!, move: 'hold', beats: 10, clips: ['#5', '#7'] },
    { ...torna.parts[3]! },
    { ...torna.parts[4]!, move: 'cut', beats: 12 },
    { ...torna.parts[5]!, move: 'cut', beats: 10, clips: ['#7', '#8', '#9'] },
    { ...torna.parts[6]!, beats: 6 },
  ] };
  const bf = checkTreatment(built, { clips: [...clips, ...many], fps, brand });
  assert.ok(!bf.some((x) => /flash-cuts|punch moves|before the drop|the arc is/.test(x.issue)), bf.map((x) => x.issue).join(' | '));
  // a user who asks for a slow, cinematic opening is not pushed into a burst
  const slow = checkTreatment({ ...built, story: 'slow cinematic build-up, then a big beat drop', parts: built.parts.map((p, i) => (i === 0 ? { ...p, move: 'hold', clips: ['#1'] } : p)) }, { clips, fps, brand });
  assert.ok(!slow.some((x) => /open on a burst/.test(x.fix)));
  console.log('treatment drop contrast: ok');
}

// RS-1249: a shot list written for another AI editor (the user's Torna brief) is built as written: the checks that
// would restructure it (a slow hook, one length, plain cuts, promo copy, the length target) stay quiet
{
  const brief = `Create a vertical 9:16 Instagram Reel, 28 seconds, from my Torna Fort trek clips. NO music.
PART 1 – HOOK + BUILD-UP (0–8s, slow and cinematic)
0.0–3.0s  Misty shot of the fort in clouds, slow motion 50%. Text: "Nobody told us Torna looks like this in November 🌧️"
3.0–5.0s  Dark road, leaving Pune. Text: "4:00 AM · Pune"
5.0–6.5s  Breakfast stop. Text: "6:00 AM · Poha & chai ☕"
6.5–8.0s  Torna seen from far away. Text: "7:00 AM · Velhe village"
14.0s      Palm moves away from the lens. Hard cut, no fade.`;
  assert.ok(isShotList(brief), 'a timed brief is a shot list');
  assert.ok(!isShotList(ex.story), 'a story is not');
  assert.ok(!isShotList('a 25s reel, the drop at 8s, about 40 s long'), 'lengths alone are not a shot list');
  const raw = {
    ...ex, story: brief, tone: 'epic', concepts: [{ name: 'Their list', idea: 'as written' }], chosen: 0, signature: '',
    textStyles: ['caption'], transitions: [], effects: [], graphics: [],
    parts: [
      { role: 'hook', beats: 6, move: 'hold', clips: ['#1'], line: 'Nobody told us Torna looks like this in November 🌧️', purpose: 'hook' },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ role: 'journey', beats: 4, move: 'cut', clips: [`#${i}`], line: `LINE ${i}`, purpose: `p${i}` })),
    ],
  };
  const parsed = parseTreatment(raw);
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
  const t = (parsed as { treatment: Treatment }).treatment;
  assert.equal(t.shotList, true, 'detected from the story');
  const brand = { name: 'Pune Trekkers', words: 'free trekking group in Pune' };
  const sf = checkTreatment(t, { clips, fps, brand });
  assert.ok(!sf.some((x) => /hook is|metronome|plain cuts|both cut|no transitions|signature|end card|names Pune Trekkers|the arc is|carr/.test(x.issue)), sf.map((x) => x.issue).join(' | '));
  // what still matters: a line too long to read in its time
  const fast = checkTreatment({ ...t, parts: t.parts.map((p, i) => (i === 0 ? { ...p, beats: 2 } : p)) }, { clips, fps });
  assert.ok(fast.some((x) => /part 0: ".*" is 9 words in 1\.0 s/.test(x.issue)), fast.map((x) => x.issue).join(' | '));
  // the same treatment without the shot list gets the taste checks
  assert.ok(checkTreatment({ ...t, shotList: undefined, story: ex.story }, { clips, fps, brand }).some((x) => /no transitions|end card/.test(x.issue)));
  console.log('treatment shot list: ok');
}

// RS-1249: the critique of a shot list checks it against itself
{
  const plan = { version: 1 as const, ratio: '9:16' as const, shotList: true, sections: [{ move: 'cut', seconds: 3 }, { move: 'cut', seconds: 2 }, { move: 'cut', seconds: 2 }, { move: 'cut', seconds: 2 }] };
  const spans = [{ from: 0, to: 3 }, { from: 3, to: 5 }, { from: 5, to: 7 }, { from: 7, to: 9 }];
  assert.deepEqual(critiquePlan(plan, spans), []);
  assert.ok(critiquePlan({ ...plan, shotList: undefined }, spans).length > 0, 'without it the taste checks run');
  assert.match(criticBrief({ ...ex, shotList: true }), /against the user's shot list/);
  assert.doesNotMatch(criticBrief(ex), /shot list/);
  console.log('critique shot list: ok');
}
