// RS-1002: checklist ticks as media/text are added; saved brief + confirmations reopen with the same progress.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapBriefToRecipe, type ReelsBrief } from '../../shared/reelsmith/brief';
import { parseRecipe } from '../../shared/reelsmith/recipe';
import { briefChecklist, restoreRunSelections } from './briefChecklist';
import { loadRun, saveRun, type Kv } from './runStore';
import { defaultValues } from './setupForm';

const parsed = parseRecipe(readFileSync('recipes/travel-diary.recipe.json', 'utf8'));
assert.ok(parsed.ok);
const recipe = parsed.recipe;
const clipInput = recipe.inputs.find((i) => i.kind === 'media' && i.accept.includes('video'))!;
const audioInput = recipe.inputs.find((i) => i.kind === 'media' && i.accept.includes('audio'))!;
const textInput = recipe.inputs.find((i) => i.kind === 'text')!;
const brief: ReelsBrief = {
  version: 1, target: { recipeId: recipe.id, ratio: '9:16' },
  clips: [{ count: 2, shotType: 'scenery', minLengthSec: 2 }],
  music: { mode: 'vibe', description: 'warm' }, text: [{ count: 1, maxWords: 3 }],
};
const mapping = mapBriefToRecipe(brief, recipe);
const fps = 30;
const assets = [{ id: 'a', durationInFrames: 90 }, { id: 'b', durationInFrames: 30 }, { id: 'c', durationInFrames: 120 }, { id: 'song', durationInFrames: 900 }];
const values = defaultValues(recipe);
const get = (v = values, confirmed: number[] = []) => briefChecklist(brief, mapping, v, assets, fps, confirmed);

let r = get();
assert.equal(r.complete, false);
assert.deepEqual(r.items.map((i) => i.complete), [false, false, false]);
assert.match(r.items[0]!.label, /^0\/2 scenery clips, at least 2s/);

// a 1 s clip does not count toward a "min 2 s" request
values.media[clipInput.id] = [{ assetId: 'a', kind: 'video' }, { assetId: 'b', kind: 'video' }];
assert.match(get().items[0]!.label, /^1\/2/);
values.media[clipInput.id]!.push({ assetId: 'c', kind: 'video' });
assert.match(get().items[0]!.label, /^2\/2/);
assert.equal(get().items[0]!.complete, false, 'shot type must be confirmed by hand');
assert.equal(get(values, [0]).items[0]!.complete, true);

values.media[audioInput.id] = [{ assetId: 'song', kind: 'audio' }];
values.texts[textInput.id] = 'one two three four';
assert.equal(get(values, [0]).items[1]!.complete, false, 'too many words');
values.texts[textInput.id] = 'one two three';
r = get(values, [0]);
assert.deepEqual(r.items.map((i) => i.complete), [true, true, true]);
assert.equal(r.complete, true);

// no brief means nothing blocks Assemble; Instagram music is always ticked
assert.deepEqual(briefChecklist(undefined, null, values, assets, fps, []), { items: [], complete: true });
const ig = { ...brief, music: { mode: 'instagram' as const } };
assert.equal(briefChecklist(ig, mapBriefToRecipe(ig, recipe), defaultValues(recipe), assets, fps, []).items.at(-1)!.complete, true);

// a wrong-ratio brief keeps Assemble gated (warning) until "assemble anyway"
const wide = { ...brief, target: { ...brief.target, ratio: '16:9' as const } };
assert.equal(briefChecklist(wide, mapBriefToRecipe(wide, recipe), values, assets, fps, [0]).complete, false);

// saved with the run, reopened after "relaunch" (a fresh store read) with the same progress
const mem = new Map<string, unknown>();
const kv: Kv = { get: async (k) => mem.get(k) as never, set: async (k, v) => { mem.set(k, JSON.parse(JSON.stringify(v))); } };
await saveRun(kv, 'p1', { recipeId: recipe.id, seed: 1, brief, briefConfirmedShotRequests: [0] } as never);
const reopened = await loadRun(kv, 'p1');
assert.ok(reopened?.brief);
assert.deepEqual(reopened.briefConfirmedShotRequests, [0]);
assert.deepEqual(briefChecklist(reopened.brief, mapBriefToRecipe(reopened.brief, recipe), values, assets, fps, reopened.briefConfirmedShotRequests ?? []), r);
// a relaunch loses the form's own state: the media and text come back from the saved run alone
const fresh = defaultValues(recipe);
const savedRun = { media: { [clipInput.id]: ['a', 'b', 'gone'], [audioInput.id]: ['song'] }, texts: { [textInput.id]: 'one two three' } };
const media = [{ id: 'a', kind: 'video' }, { id: 'b', kind: 'video' }, { id: 'c', kind: 'video' }, { id: 'song', kind: 'audio' }];
const restored = restoreRunSelections(savedRun, media, fresh);
assert.deepEqual(restored.media[clipInput.id], [{ assetId: 'a', kind: 'video' }, { assetId: 'b', kind: 'video' }], 'missing assets are skipped');
assert.deepEqual(restored.media[audioInput.id], [{ assetId: 'song', kind: 'audio' }]);
assert.equal(restored.texts[textInput.id], 'one two three');
assert.deepEqual(restoreRunSelections(savedRun, media, restored), restored, 'restoring twice changes nothing');
const picked = { ...fresh, media: { [clipInput.id]: [{ assetId: 'c', kind: 'video' as const }] } };
assert.deepEqual(restoreRunSelections(savedRun, media, picked).media[clipInput.id], picked.media[clipInput.id], 'a fresh pick is not overwritten');
console.log('briefChecklist verify ok');
