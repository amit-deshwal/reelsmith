import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CURRENT_PROJECT_VERSION } from '../../shared/project-version';
import type { ProjectDoc } from '../editor/types';
import { parseRecipe } from '../../shared/reelsmith/recipe';
import { clearRecipeStart, pendingRecipeStart, recipeProjectDoc, startRecipeProject } from './recipeStart';

const parsed = parseRecipe(readFileSync('recipes/travel-beat-montage.recipe.json', 'utf8'));
assert.ok(parsed.ok);
const recipe = parsed.recipe;
const empty: ProjectDoc = { version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't1', timelines: [{
  id: 't1', name: 'Sequence 1', order: 0, fps: 30, width: 1920, height: 1080,
  items: [], selectedId: null, trackOrder: ['v1'], tracks: { v1: { kind: 'video' } },
}] };
const before = JSON.stringify(empty);
const doc = recipeProjectDoc(empty, recipe);
assert.equal(doc.timelines[0].width, 1080);
assert.equal(doc.timelines[0].height, 1920);
assert.equal(doc.timelines[0].fps, 30);
assert.equal(JSON.stringify(empty), before, 'does not mutate the supplied empty document');
assert.equal(recipeProjectDoc(empty, { ...recipe, canvas: { ...recipe.canvas, fps: { num: 30000, den: 1001 } } }).timelines[0].fps, 30000 / 1001);

const calls: string[] = [];
await startRecipeProject(recipe, {
  create: async (name, selected) => {
    calls.push('create'); assert.equal(name, recipe.name); assert.equal(selected, recipe);
    return { id: 'new-recipe-project' };
  },
  refresh: async () => { calls.push('refresh'); },
  open: (id) => {
    calls.push('open'); assert.equal(id, 'new-recipe-project');
    assert.equal(pendingRecipeStart(id), recipe.id, 'setup choice exists before navigation');
  },
});
assert.deepEqual(calls, ['create', 'refresh', 'open']);
assert.equal(pendingRecipeStart('different-project'), undefined, 'does not affect existing projects');
clearRecipeStart('new-recipe-project');
assert.equal(pendingRecipeStart('new-recipe-project'), undefined, 'handoff is cleared after mounting');
await assert.rejects(startRecipeProject(recipe, {
  create: async () => { throw new Error('Disk full'); },
  refresh: async () => assert.fail('must not refresh after failed creation'),
  open: () => assert.fail('must not navigate after failed creation'),
}), /Disk full/);
console.log('recipeStart.verify: ok');
