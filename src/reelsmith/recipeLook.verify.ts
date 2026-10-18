import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parseRecipe, type Recipe } from '../../shared/reelsmith/recipe';
import { RECIPE_SCHEMA } from '../../shared/reelsmith/recipe-schema';
import type { AtomicAction } from '../editor/reducerActions';
import { ALL_FX } from '../gl/fx/effects';
import { isLookEffect, lookById, planLook } from './looks';
import { SECTION_EFFECT_PREFIX, withRecipeLook } from './recipeLook';

// every look a recipe may name exists
for (const id of RECIPE_SCHEMA.properties.look.properties.reelLook.enum) assert.ok(lookById(id), `reelLook ${id} is a built-in look`);

// every effect a bundled recipe names exists, with real parameter names inside their ranges
const recipes: Recipe[] = readdirSync('recipes').filter((f) => f.endsWith('.recipe.json')).map((f) => {
  const r = parseRecipe(readFileSync(`recipes/${f}`, 'utf8')); assert.ok(r.ok, f); return r.recipe;
});
for (const recipe of recipes) {
  for (const fx of [...(recipe.look?.effects ?? []), ...recipe.structure.flatMap((s) => s.effects ?? [])]) {
    const def = ALL_FX[fx.assetId];
    assert.ok(def, `${recipe.id}: unknown effect ${fx.assetId}`);
    for (const [key, value] of Object.entries(fx.overrides ?? {})) {
      const prop = def.props?.find((p) => p.key === key);
      assert.ok(prop, `${recipe.id}: ${fx.assetId} has no parameter ${key}`);
      if (typeof value === 'number' && 'min' in prop && typeof prop.min === 'number' && typeof prop.max === 'number') {
        assert.ok(value >= prop.min && value <= prop.max, `${recipe.id}: ${fx.assetId}.${key}=${value} outside ${prop.min}..${prop.max}`);
      }
    }
  }
}

const add = (id: string, kind: string, section: string, effects?: unknown[]) => ({ type: 'add', item: { id, kind, track: 'V1', durationInFrames: 30, props: { rsSection: section }, ...(effects ? { effects } : {}) }, startFrame: 0 }) as unknown as AtomicAction;
const actions = [add('v', 'video', 'drop', [{ id: 'match', assetId: 'builtin:match', overrides: {} }]), add('p', 'image', 'build'), add('t', 'text', 'drop'), add('m', 'audio', 'drop'), { type: 'clear' } as AtomicAction];
const fx = (a: AtomicAction) => (a.type === 'add' ? a.item.effects ?? [] : []);
const steps = lookById('retro-vhs')!.steps.length;

// reelLook alone
const look = { look: { reelLook: 'retro-vhs' }, structure: [] } as unknown as Recipe;
const out = withRecipeLook(actions, look);
assert.equal(fx(out[0]!)[0]!.id, 'match', 'shot matching stays first');
assert.equal(fx(out[0]!).filter(isLookEffect).length, steps);
assert.equal(fx(out[1]!).filter(isLookEffect).length, steps, 'photos get the look too');
assert.deepEqual(fx(out[2]!), [], 'text untouched');
assert.deepEqual(fx(out[3]!), [], 'audio untouched');
assert.deepEqual(out[4], actions[4]);
assert.equal(withRecipeLook(actions, { structure: [] } as unknown as Recipe), actions);
assert.equal(withRecipeLook(actions, { look: { reelLook: 'not-a-look' }, structure: [] } as unknown as Recipe), actions);

// section effects go on that section's shots only, before the recipe-wide look and effects
const full = {
  look: { reelLook: 'retro-vhs', effects: [{ assetId: 'builtin:fx-shake', overrides: { strength: 2 } }] },
  structure: [{ section: 'build' }, { section: 'drop', effects: [{ assetId: 'builtin:fx-thermal' }, { assetId: 'builtin:fx-rgb-split', overrides: { amount: 0.02 } }] }],
} as unknown as Recipe;
const out2 = withRecipeLook(actions, full);
assert.deepEqual(fx(out2[0]!).map((e) => e.assetId), ['builtin:match', 'builtin:fx-thermal', 'builtin:fx-rgb-split', ...lookById('retro-vhs')!.steps.map((s) => s.assetId), 'builtin:fx-shake']);
assert.deepEqual(fx(out2[1]!).map((e) => e.assetId), [...lookById('retro-vhs')!.steps.map((s) => s.assetId), 'builtin:fx-shake'], 'build has no section effects');
assert.equal(fx(out2[0]!).find((e) => e.assetId === 'builtin:fx-rgb-split')!.overrides?.amount, 0.02);
assert.ok(fx(out2[0]!).filter((e) => e.id.startsWith(SECTION_EFFECT_PREFIX)).length === 2);
assert.equal(new Set(fx(out2[0]!).map((e) => e.id)).size, fx(out2[0]!).length, 'effect ids are unique on a clip');
// overrides are copies: editing one clip's slider never moves another's
const a = fx(out2[0]!).find((e) => e.assetId === 'builtin:fx-shake')!; const b = fx(out2[1]!).find((e) => e.assetId === 'builtin:fx-shake')!;
assert.notEqual(a.overrides, b.overrides);

// picking another look later replaces the recipe-wide part and keeps the section effects
const item = (out2[0] as Extract<AtomicAction, { type: 'add' }>).item;
const swapped = planLook([item as never], lookById('soft-pastel')!).actions[0] as Extract<AtomicAction, { type: 'setEffects' }>;
assert.deepEqual(swapped.effects.map((e) => e.assetId), ['builtin:match', 'builtin:fx-thermal', 'builtin:fx-rgb-split', ...lookById('soft-pastel')!.steps.map((s) => s.assetId)]);
console.log('recipeLook verify ok');
