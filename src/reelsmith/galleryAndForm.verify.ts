import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parseRecipe, type Recipe } from '../../shared/reelsmith/recipe';
import { buildGallery, requirementsText, toCard } from './galleryModel';
import { canAssemble, defaultValues, validateSetup, widgetFor } from './setupForm';

const load = (f: string): Recipe => {
  const r = parseRecipe(readFileSync(`recipes/${f}`, 'utf8'));
  assert.ok(r.ok, f);
  return r.recipe;
};
const recipes = readdirSync('recipes').filter((f) => f.endsWith('.recipe.json')).map(load);
const travel = recipes.find((r) => r.id === 'travel-beat-montage')!;

// gallery
assert.equal(requirementsText(travel), '6–80 clips + 1 song');
assert.equal(toCard(travel).aspect, '9:16');
const g = buildGallery(recipes);
assert.equal(g.cards.length, 9);
assert.equal(g.categories[0]!.count, 9);
assert.deepEqual(buildGallery(recipes, { category: 'collage' }).cards.map((c) => c.id).sort(), ['collage-grid', 'photo-dump']);
assert.equal(buildGallery(recipes, { query: 'caption' }).cards.length >= 1, true);
// 20 recipes render quickly
const twenty = Array.from({ length: 20 }, (_, i) => ({ ...travel, id: `r${i}-${travel.id}` }));
const t0 = performance.now();
const big = buildGallery(twenty);
assert.equal(big.cards.length, 20);
assert.ok(performance.now() - t0 < 50, 'model builds in well under 1 s');

// setup form
const v = defaultValues(travel);
assert.equal(canAssemble(travel, v), false, 'nothing added yet');
const clips = Array.from({ length: 10 }, (_, i) => ({ assetId: `c${i}`, kind: 'video' as const }));
v.media.clips = clips;
v.media.music = [{ assetId: 'song', kind: 'audio' }];
assert.equal(canAssemble(travel, v), true);
// invalid inputs block assembly
v.media.clips = clips.slice(0, 3);
assert.deepEqual(validateSetup(travel, v).map((e) => e.field), ['clips']);
v.media.clips = [...clips, { assetId: 'img-as-audio', kind: 'audio' }];
assert.match(validateSetup(travel, v)[0]!.message, /not video\/image/);
v.media.clips = [...clips, clips[0]!];
assert.match(validateSetup(travel, v)[0]!.message, /twice/);
v.media.clips = clips;
v.texts.place = 'x'.repeat(41);
assert.match(validateSetup(travel, v)[0]!.message, /at most 40/);
v.texts.place = 'Pune';
v.params.cutRule = 'every3Beats';
assert.equal(validateSetup(travel, v)[0]!.field, 'cutRule');
v.params.cutRule = 'everyBar';
v.params.accent = 'yellow';
assert.equal(validateSetup(travel, v)[0]!.field, 'accent');
v.params.accent = '#FFD23F';
assert.equal(canAssemble(travel, v), true);
assert.equal(widgetFor(travel.params.find((p) => p.id === 'cutRule')!), 'select');
assert.equal(widgetFor(travel.params.find((p) => p.id === 'accent')!), 'color');
assert.equal(widgetFor(travel.params.find((p) => p.id === 'clipAudio')!), 'toggle');
const beat = load('beat-cut.recipe.json');
assert.equal(widgetFor(beat.params.find((p) => p.id === 'dropAtS')!), 'slider');
console.log('galleryAndForm.verify: ok');

// Validate against the current project, rather than trusting stale UI picks.
const available = [...clips.map((c) => ({ id: c.assetId, kind: c.kind })), { id: 'song', kind: 'audio' }];
assert.equal(canAssemble(travel, v, available), true);
assert.match(validateSetup(travel, v, available.filter((a) => a.id !== clips[0]!.assetId))[0]!.message, /no longer in the project/);
assert.match(validateSetup(travel, v, available.map((a) => a.id === clips[0]!.assetId ? { ...a, kind: 'audio' } : a))[0]!.message, /not video\/image/);
v.params.accent = '#FFD23F';
v.agentPick = 'claude';
assert.equal(canAssemble(travel, v, available), true);
v.params.accent = NaN;
assert.equal(canAssemble(travel, v, available), false);
v.params.accent = '#FFD23F';
v.agentPick = 'codex' as never;
assert.match(validateSetup(travel, v, available).find((e) => e.field === 'agentPick')!.message, /Off or Claude/);
