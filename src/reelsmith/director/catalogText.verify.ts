import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withCatalog, CATALOG_START } from './catalogText';
import { MOVES, TEXT_STYLES } from './moves';
import { DIRECTOR_EFFECTS, DIRECTOR_TRANSITIONS } from './catalog';
import { DIRECTOR_SOUNDS } from './sfx';
import { REEL_LOOKS } from '../looks';
import { GRAPHICS } from './graphics';
import { resolvePlanSections } from './assembleDirector';
import { parsePlan } from '../../../shared/reelsmith/directorPlan';
import { directorOptions, directorTreatment, resolveClipRef, sheetSamples, songSuggestion } from '../agent/directorTools';
import { directorCritique } from '../agent/directorRepairTools';
import { directorSession, updateDirectorSession } from './directorSession';

// the skill carries the current catalogue (run sync-director-catalog.mts after changing the library)
const skill = readFileSync(new URL('../../agent/skills/reels-director/SKILL.md', import.meta.url), 'utf8');
assert.equal(withCatalog(skill), skill, 'the reels-director catalogue is stale: npx tsx src/reelsmith/director/sync-director-catalog.mts');
const cat = skill.slice(skill.indexOf(CATALOG_START));
for (const id of [...MOVES.map((m) => m.id), ...TEXT_STYLES.map((t) => t.id), ...DIRECTOR_EFFECTS.map((e) => e.id.replace('builtin:fx-', '')), ...DIRECTOR_TRANSITIONS.map((t) => t.id), ...GRAPHICS.map((g) => g.id)]) {
  assert.ok(cat.includes(`\`${id}\``), `catalogue lists ${id}`);
}
// the hand-written part never drifts from the code: its example plan and overlay snippet pass the plan check, and every
// kebab-case id it names is in the catalogue (a renamed move or style would otherwise send the agent into a refused build)
const hand = skill.slice(0, skill.indexOf(CATALOG_START));
const known = new Set([...MOVES.map((m) => m.id), ...TEXT_STYLES.map((t) => t.id), ...DIRECTOR_EFFECTS.map((e) => e.id.replace('builtin:fx-', '')), ...DIRECTOR_TRANSITIONS.map((t) => t.id), ...DIRECTOR_SOUNDS.map((x) => x.id), ...REEL_LOOKS.map((l) => l.id), ...GRAPHICS.map((g) => g.id)]);
const named = [...hand.replace(/```[\s\S]*?```/g, '').matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/g)].map((m) => m[1]!);
assert.deepEqual(named.filter((id) => !known.has(id)), [], 'ids the skill names that the catalogue lacks');
const checkPlan = (raw: unknown, what: string) => {
  const parsed = parsePlan(raw);
  assert.ok(parsed.ok, `${what}: ${parsed.ok ? '' : parsed.errors.join('; ')}`);
  const problems: string[] = [];
  resolvePlanSections(parsed.plan, [], problems);
  assert.deepEqual(problems, [], what);
  return parsed.plan;
};
const example = checkPlan(JSON.parse(/```json\n([\s\S]*?)```/.exec(hand)![1]!), 'the example plan');
const overlay = /`("overlays": \[[^`]*\])`/.exec(hand)![1]!;
checkPlan({ ...JSON.parse(`{${overlay}}`), sections: example.sections }, 'the overlay snippet');
// the whole skill loads in one load_skill result (64k characters with its metadata)
assert.ok(skill.length < 56_000, `skill is ${skill.length} characters`);

// options stay far under the 16k-character limit above which an external agent only gets an artifact pointer
const assets = Array.from({ length: 60 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, name: `IMG_${7800 + i}.MOV`, kind: 'video', src: '/x', durationInFrames: 300, width: 1080, height: 1920 }));
const ctx: any = { getState: () => ({ fps: 30, items: [] }), getDoc: () => ({ assets }), audio: [] };
const warmed: string[] = [];
const out: any = await directorOptions({}, ctx, { api: { musicGrid: async () => null, clipFeatures: async (a: any) => { warmed.push(a.id); return null; } } } as any);
await new Promise((r) => setTimeout(r, 20));
assert.equal(new Set(warmed).size, assets.filter((a: any) => a.kind !== 'audio').length, 'clip analysis warmed for every clip while the agent plans');
assert.equal(warmed.length, new Set(warmed).size, 'each clip once');
const { __images: _i, ...text } = out;
assert.ok(JSON.stringify(text).length < 12_000, `options are ${JSON.stringify(text).length} characters`);
assert.equal(out.clips[6].startsWith('#7 IMG_7806.MOV'), true);
// RS-1214 stages: the options log the footage for the later stages and point at the treatment
assert.match(out.clips[6], /not analysed/, 'a clip the analysis could not read says so');
assert.equal(directorSession('current')?.clips.length, 60);
assert.match(out.next, /reels_director_treatment/);
const story = 'bro lied to me that it would be easy hike';
const treated: any = directorTreatment({
  story, concepts: [{ name: 'a', idea: 'x' }, { name: 'b', idea: 'y' }], chosen: 1, tone: 'funny', signature: 'freeze-intro on bro',
  parts: [{ role: 'hook', beats: 4, move: 'freeze-intro', clips: ['#7'], line: 'bro lied to me', purpose: 'who lied' }, { role: 'build', beats: 8, move: 'cut', clips: ['#1', '#2'], purpose: 'the climb is not easy' }, { role: 'ending', beats: 8, move: 'hold', clips: ['#3'], line: 'easy hike', purpose: 'the joke lands' }],
  textStyles: ['pop-words'], transitions: ['whip-blur'], effects: ['zoom-blur'], graphics: ['annotate'],
}, ctx);
assert.equal(treated.ok, true, JSON.stringify(treated));
assert.deepEqual(treated.findings, []);
assert.ok(treated.catalog.includes('`freeze-intro`') && treated.catalog.includes('`pop-words`') && !treated.catalog.includes('`velocity`'));
assert.ok(JSON.stringify(treated).length < 12_000);
assert.equal(directorSession('current')?.treatment?.tone, 'funny');
assert.match((directorTreatment({ concepts: [] }, ctx) as any).error, /two different concepts/);
assert.match((directorTreatment({ lookup: ['velocity', 'nope'] }, ctx) as any).catalog, /`velocity`/);
// the critique reads the last build: none yet is a clear error; with one it returns findings and the checklist
assert.match((await directorCritique(ctx) as any).error, /build the reel/);
updateDirectorSession('current', { lastBuild: { plan: { version: 1, ratio: '9:16', sections: [{ move: 'hold', clips: ['a'], text: story, textStyle: 'caption' }, { move: 'cut', clips: ['b'] }, { move: 'cut', clips: ['c'] }, { move: 'hold', clips: ['d'] }] } as any, spans: [{ from: 0, to: 4 }, { from: 4, to: 8 }, { from: 8, to: 12 }, { from: 12, to: 15 }], builds: 1 } });
const critique: any = await directorCritique({ ...ctx, getState: () => ({ fps: 30, items: [], tracks: [] }) });
assert.ok(!JSON.stringify(critique).includes('"signature"'), 'no key the external projection redacts');
assert.ok(critique.findings.some((x: any) => /hard cut/.test(x.issue)) && /picky creative director/.test(critique.checklist) && /funny/.test(critique.checklist));
// "#n" references
assert.equal(resolveClipRef('#7', assets), assets[6]!.id);
assert.equal(resolveClipRef('#7@4.5', assets), `${assets[6]!.id}@4.5`);
assert.equal(resolveClipRef('#61', assets), null);
assert.equal(resolveClipRef('abc@2', assets), 'abc@2');
// song timing done for the agent: a long song starts 8 beats before its drop, which lands on beat 8 of the reel
const grid = { beatTimesSec: Array.from({ length: 800 }, (_, i) => 0.1 + i * 0.56), downbeatIndex: 0, dropSec: 61.7, loudestStartSec: 58 };
const sug = songSuggestion(grid, 107, 446);
assert.equal(sug.dropAtBeat, 8);
assert.ok(Math.abs(sug.musicStart - (61.7 - 8 * 0.56)) < 0.3);
assert.equal(sug.beatsFor18s, 32);
// a short song starts on its first downbeat
assert.equal(songSuggestion({ ...grid, beatTimesSec: grid.beatTimesSec.slice(0, 40) }, 107, 22).musicStart, 0.1);
// every clip fits on the contact sheets: four moments each while they fit, fewer for long lists
assert.deepEqual(sheetSamples(20, 0), [0.1, 0.37, 0.63, 0.9], '20 videos: 80 cells');
assert.equal(sheetSamples(21, 0).length, 3);
assert.deepEqual(sheetSamples(40, 0), [0.1, 0.9]);
assert.deepEqual(sheetSamples(60, 0), [0.5]);
assert.equal(sheetSamples(19, 10).length, 3, 'photos take cells too');
// the Director box's sound line follows what is imported: an unconditional "with no song imported, keep the clips'
// own sound" made the agent leave out the user's imported song
{
  const { directorPrompt } = await import('./directorPrompt');
  assert.match(directorPrompt('trek', '9:16', 1), /put it to the song I imported\./);
  assert.doesNotMatch(directorPrompt('trek', '9:16', 1), /clips' own sound/);
  assert.match(directorPrompt('trek', '9:16', 0), /no song is imported, so keep the clips' own sound/);
  assert.match(directorPrompt('trek', '9:16', 2), /pick the one that fits the story/);
}
console.log('catalogText: ok');
