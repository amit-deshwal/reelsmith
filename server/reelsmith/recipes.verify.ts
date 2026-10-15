import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRecipe } from '../../shared/reelsmith/recipe.ts';
import { loadRecipesFromDir } from './recipes.ts';

const loaded = await loadRecipesFromDir('recipes');
assert.deepEqual(loaded.rejected, [], 'shipped recipes must all validate');
assert.equal(loaded.recipes.length, 5, 'five release-1 recipes');

const base = JSON.parse(readFileSync('recipes/beat-cut.recipe.json', 'utf8'));
const clone = () => structuredClone(base);
const reject = (name: string, mutate: (r: any) => void, match: RegExp) => {
  const r = clone(); mutate(r);
  const v = validateRecipe(r);
  assert.equal(v.ok, false, `${name} must be rejected`);
  assert.ok(!v.ok && v.errors.some((e) => match.test(e)), `${name}: errors ${JSON.stringify(!v.ok && v.errors)}`);
};

reject('template injection in text', (r) => { r.structure[0].overlays = [{ kind: 'title', text: '{{constructor.constructor}}' }]; }, /pattern|template/);
reject('template in agentHints with bad ref', (r) => { r.agentHints = 'use {{ inputs.nope }}'; }, /not allowed|unknown/);
reject('template refers to unknown param', (r) => { r.agentHints = '{{params.missing}}'; }, /unknown params/);
reject('unknown strategy', (r) => { r.assembler.strategy = 'evil@9'; }, /allowed values|enum/);
reject('enum without options', (r) => { delete r.params[2].options; }, /options/);
reject('enum default outside options', (r) => { r.params[2].default = 'nope'; }, /default not in options/);
reject('music input not audio', (r) => { r.music.inputId = 'clips'; }, /must accept audio/);
reject('unknown field', (r) => { r.script = 'rm -rf /'; }, /additional/);
reject('unknown styleId', (r) => { r.structure[0].overlays = [{ kind: 'title', styleId: 'ghost' }]; }, /styleId/);
reject('odd canvas', (r) => { r.canvas.width = 1081; }, /multiple/);

console.log('recipes.verify: ok');
