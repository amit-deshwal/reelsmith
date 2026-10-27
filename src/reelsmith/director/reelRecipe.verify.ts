import assert from 'node:assert/strict';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { recipeForRatio, validateRecipe } from '../../../shared/reelsmith/recipe';
import type { MediaAsset } from '../../editor/types';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { runRecipe, type AnalyzeApi } from '../runRecipe';
import { defaultValues } from '../setupForm';
import { directorRecipe } from './assembleDirector';
import type { SavedDirector } from './directorSession';
import { LINES_INPUT, reelTemplateOf, reelToRecipe, remixPlan, remixTreatment } from './reelRecipe';
import type { Treatment } from './treatment';

const fps = 30;
const clip = (id: string, top?: string, extra: Partial<AssemblyClip> = {}): AssemblyClip => ({
  assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', width: 1080, height: 1920, durationInFrames: 300, score: 0.5,
  ...(top ? { shot: { top: top as never, confidence: 0.9, scores: { [top]: 0.9 } as never } } : {}), ...extra,
});
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 90, beatTimesSec: Array.from({ length: 180 }, (_, i) => 0.2 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };

// the original reel: their clips, their song, their words, a custom shader and a custom graphic
const original: AssemblyClip[] = [clip('fort', 'scenery'), clip('gang', 'people'), clip('chai', 'food'), clip('summit', 'scenery'), clip('jump', 'action')];
const parsed = parsePlan({
  ratio: '9:16', music: 'song', musicStart: 12.5, tone: 'epic',
  sections: [
    { move: 'hold', beats: 8, clips: ['fort@3'], text: 'AMK, the toughest trek', textStyle: 'cinematic-title' },
    { move: 'cut', beats: 8, params: { every: 2 }, clips: ['gang', 'chai', 'jump', 'gang'], transition: 'custom:tr-ink', effects: [{ id: 'custom:fx-ember' }, { id: 'shake', timing: 'beat' }] },
    { move: 'hold', beats: 6, clips: ['summit'], text: 'we made it', textStyle: 'big-title', textBehind: true, transition: 'whip-blur' },
  ],
  overlays: [{ text: 'Harishchandragad', style: 'title-shuffle', from: 0, to: 1 }],
  graphics: [{ graphic: 'confetti', from: 2, to: 2 }, { graphic: 'custom:gfx-route', from: 0, to: 0 }],
});
assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
const plan = (parsed as { plan: ReelPlan }).plan;
// built without the session-only shaders (they are not registered in a test)
const noCustom = (id?: string) => !id?.startsWith('custom:');
const buildable: ReelPlan = {
  ...plan, graphics: plan.graphics?.filter((g) => noCustom(g.graphic)),
  sections: plan.sections.map((s) => ({ ...s, transition: noCustom(s.transition) ? s.transition : undefined, effects: s.effects?.filter((e) => noCustom(e.id)) })),
};
const built = assemble({ recipe: directorRecipe(plan), clips: original, music, texts: {}, params: {}, seed: 1, plan: buildable });
assert.ok(built.action, built.report.warnings.join('; '));
const treatment: Treatment = {
  story: 'AMK with the gang', concepts: [{ name: 'Made it', idea: 'the climb to the top' }], chosen: 0, tone: 'epic', heroes: ['summit'],
  parts: [{ role: 'hook', beats: 8, move: 'hold', clips: ['fort'], line: 'AMK', purpose: 'where we are' }], signature: 'the whip to the summit',
  textStyles: ['cinematic-title'], transitions: ['whip-blur'], effects: ['shake'], graphics: ['confetti'],
};
const saved: SavedDirector = { v: 1, fps, treatment, build: { plan, spans: [{ from: 0, to: 4 }, { from: 4, to: 8 }, { from: 8, to: 11 }], builds: 2, clips: built.report.sectionClips!, moments: built.report.sectionMoments! } };
const tags = new Map(original.map((c) => [c.assetId, c.shot!.top as string]));

// saving: a valid user recipe that keeps the shape and drops the user's own media, moments and session-only shaders
const { recipe, dropped } = reelToRecipe(saved, { id: 'ai-amk-trek-abc123', name: 'AMK trek', tags });
const valid = validateRecipe(JSON.parse(JSON.stringify(recipe)));
assert.ok(valid.ok, valid.ok ? '' : valid.errors.join('; '));
assert.deepEqual(dropped.sort(), ['graphic custom:gfx-route', 'section 2: custom effect custom:fx-ember', 'section 2: custom transition custom:tr-ink']);
const t = reelTemplateOf(recipe)!;
assert.ok(t, 'the template reads back');
const tplJson = JSON.stringify(t.plan);
for (const own of ['fort', 'gang', 'summit', '"song"', '12.5', 'AMK', 'we made it', 'Harishchandragad', 'custom:']) assert.ok(!tplJson.includes(own), `the template plan has no ${own}`);
assert.equal(t.plan.sections[2]!.transition, 'whip-blur', 'built-in transitions stay');
assert.deepEqual(t.plan.sections[1]!.effects?.map((e) => e.id), ['shake']);
assert.deepEqual(t.slots.map((s) => s.tags), [['scenery'], ['people', 'food', 'action', 'people'], ['scenery']], 'slots remember what each shot showed');
assert.deepEqual(t.lines, ['AMK, the toughest trek', 'we made it', 'Harishchandragad'], 'lines in reel order, as the example');
assert.equal(recipe.inputs.find((i) => i.id === LINES_INPUT && i.kind === 'text')?.kind === 'text' && (recipe.inputs.find((i) => i.id === LINES_INPUT) as { default?: string }).default, 'AMK, the toughest trek / we made it / Harishchandragad');
assert.equal(t.treatment?.tone, 'epic');
assert.ok(!JSON.stringify(t.treatment).includes('AMK with the gang') && !JSON.stringify(t.treatment).includes('"fort"'), 'no story or cast in the treatment');
assert.ok(recipe.tags?.includes('remix'));
assert.deepEqual(recipe.casting, { opener: ['scenery'], closer: ['scenery'] });
assert.ok(recipeForRatio(recipe, '4:5') && recipeForRatio(recipe, '16:9'), 'every shape');
assert.throws(() => reelToRecipe({ v: 1, fps }, { id: 'ai-x-abc', name: 'x' }), /no director build/);
console.log('reelRecipe save: ok');

// remixing: new footage cast by what it shows, the user's lines in order, an empty line drops its slot
const mine = [clip('beach', 'water'), clip('mates', 'people'), clip('lake', 'scenery'), clip('dosa', 'food'), clip('dive', 'action'), clip('hills', 'scenery'), clip('crew', 'people')];
{
  const { plan: p, notes } = remixPlan(t, { ratio: '4:5', clips: mine, music: 'track', lines: 'Goa, finally /  / Baga beach' });
  assert.equal(p.ratio, '4:5');
  assert.equal(p.music, 'track');
  assert.equal(p.musicStart, undefined, 'a second of their song does not carry over');
  assert.deepEqual(p.sections.map((s) => s.clips), [['hills'], ['crew', 'dosa', 'dive', 'mates'], ['lake']], 'scenery for scenery, people for people, no repeats while clips last');
  assert.equal(p.sections[0]!.text, 'Goa, finally');
  assert.equal(p.sections[2]!.text, undefined, 'an empty line leaves the section without one');
  assert.equal(p.sections[2]!.textBehind, undefined);
  assert.deepEqual(p.overlays?.map((o) => o.text), ['Baga beach']);
  assert.deepEqual(p.graphics?.map((g) => g.graphic), ['confetti']);
  assert.ok(notes.some((n) => /6 of 6 shots/.test(n)), notes.join(' | '));
  const re = assemble({ recipe: { ...recipeForRatio(recipe, '4:5')!, canvas: { ...recipeForRatio(recipe, '4:5')!.canvas, fps: { num: fps, den: 1 } } }, clips: mine, music: { ...music, assetId: 'track' }, texts: {}, params: {}, seed: 1, plan: p });
  assert.ok(re.action, re.report.warnings.join('; '));
  assert.deepEqual(re.report.sectionClips, [['hills'], ['crew', 'dosa', 'dive', 'mates'], ['lake']]);
  const tr = remixTreatment(t, p)!;
  assert.equal(tr.story, 'Goa, finally / Baga beach');
  assert.deepEqual(tr.heroes, []);
}
{
  // fewer clips than shots: reused, said so; no lines at all: no words, no overlay
  const { plan: p, notes } = remixPlan(t, { ratio: '9:16', clips: mine.slice(0, 2), lines: '' });
  assert.deepEqual(p.sections.map((s) => s.clips?.length), [1, 4, 1]);
  assert.ok(notes.some((n) => /6 shots; your 2 clips are reused/.test(n)));
  assert.ok(p.sections.every((s) => !s.text) && !p.overlays && p.music === undefined);
  // a line longer than its style allows is cut at a word
  const long = remixPlan(t, { ratio: '9:16', clips: mine, lines: `${'word '.repeat(60)}/x/y/z` });
  assert.ok(long.plan.sections[0]!.text!.length < 140 && !long.plan.sections[0]!.text!.endsWith(' '));
  assert.ok(long.notes.some((n) => /was cut to fit/.test(n)) && long.notes.some((n) => /has 3 lines/.test(n)));
}
console.log('reelRecipe remix: ok');

// end to end through the Recipes panel's runner: the plan comes from the template, cast with the chosen footage
{
  const asset = (id: string, kind: MediaAsset['kind'], frames = 300): MediaAsset => ({ id, name: id, kind, src: `/media/uploads/${id}`, durationInFrames: frames, width: 1080, height: 1920 });
  const assets = [...mine.map((c) => asset(c.assetId, 'video')), asset('track', 'audio', 3600)];
  const api: AnalyzeApi = {
    clipFeatures: async (a) => ({ assetId: a.id, dHash: (a.id.charCodeAt(1) % 16).toString(16).repeat(16), windows: [{ startFrame: 30, endFrame: 200, sharpness: 0.6, exposure: 0.7, motion: 0.4, subject: 0, speech: false }] }),
    musicGrid: async () => ({ durationSec: 60, beatTimesSec: Array.from({ length: 120 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 }),
    shotTags: async (as) => new Map(as.map((a) => [a.id, { top: mine.find((c) => c.assetId === a.id)!.shot!.top, confidence: 0.9, samples: 3, scores: {} as never }])),
  };
  const values = defaultValues(recipe);
  values.media.clips = mine.map((c) => ({ assetId: c.assetId, kind: 'video' as const }));
  values.media.music = [{ assetId: 'track', kind: 'audio' }];
  values.texts[LINES_INPUT] = 'One / Two / Three';
  const out = await runRecipe(api, { recipe, ratio: '9:16', values, assets, fps, replaceTimeline: true, seed: 1 });
  assert.ok(out.action, out.messages.join('; '));
  assert.equal(out.plan?.sections[0]!.text, 'One');
  assert.deepEqual(out.plan?.sections[0]!.clips, ['hills']);
  assert.ok(out.action!.actions.some((a) => a.type === 'add' && a.item.kind === 'audio' && a.item.sourceAssetId === 'track'), 'the song is on the reel');
}
console.log('reelRecipe run: ok');
