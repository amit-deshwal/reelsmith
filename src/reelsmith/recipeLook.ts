// A recipe's look on the clips it assembles: each section's own `effects` first (a thermal drop, a kaleidoscope hook), then
// `look.reelLook` (a built-in look) and `look.effects`, on every picture clip, after shot matching. The recipe-wide part uses
// the look effect ids planLook uses, so the Looks panel or the agent can swap or clear it later; section effects stay.
import type { Recipe, RecipeEffect } from '../../shared/reelsmith/recipe';
import type { AtomicAction } from '../editor/reducerActions';
import type { ClipEffect } from '../editor/types';
import { LOOK_EFFECT_PREFIX, lookById, lookEffects } from './looks';

export const SECTION_EFFECT_PREFIX = 'rsfx_';

const toEffects = (list: RecipeEffect[] | undefined, idPrefix: string): ClipEffect[] =>
  (list ?? []).map((fx, i) => ({ id: `${idPrefix}${i}`, assetId: fx.assetId, overrides: { ...(fx.overrides ?? {}) } }));

export function withRecipeLook(actions: AtomicAction[], recipe: Pick<Recipe, 'look' | 'structure'>): AtomicAction[] {
  const look = recipe.look?.reelLook ? lookById(recipe.look.reelLook) : undefined;
  const global = [...(look ? lookEffects(look) : []), ...toEffects(recipe.look?.effects, `${LOOK_EFFECT_PREFIX}recipe_`)];
  const bySection = new Map(recipe.structure.filter((s) => s.effects?.length).map((s) => [s.section, toEffects(s.effects, `${SECTION_EFFECT_PREFIX}${s.section}_`)]));
  if (!global.length && !bySection.size) return actions;
  return actions.map((action) => {
    if (action.type !== 'add' || (action.item.kind !== 'video' && action.item.kind !== 'image')) return action;
    const section = (action.item.props as { rsSection?: unknown } | undefined)?.rsSection;
    const local = typeof section === 'string' ? bySection.get(section) ?? [] : [];
    return { ...action, item: { ...action.item, effects: [...(action.item.effects ?? []), ...local.map((e) => ({ ...e, overrides: { ...e.overrides } })), ...global.map((e) => ({ ...e, overrides: { ...e.overrides } }))] } };
  });
}
