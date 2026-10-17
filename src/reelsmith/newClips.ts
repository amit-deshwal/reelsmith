// RS-108: a re-cut can use clips imported after the recipe was assembled. They join the recipe's clips input (the first
// media input that takes video or photos), after the clips already saved with the run, up to that input's maximum.
import type { Recipe, RecipeMediaInput } from '../../shared/reelsmith/recipe';
import type { MediaAsset } from '../editor/types';
import type { SetupValues } from './setupForm';

export interface NewClipsResult { values: SetupValues; added: string[] }

export function withNewClips(values: SetupValues, recipe: Recipe, assets: readonly Pick<MediaAsset, 'id' | 'kind'>[]): NewClipsResult {
  const input = recipe.inputs.find((i): i is RecipeMediaInput => i.kind === 'media' && (i.accept.includes('video') || i.accept.includes('image')));
  if (!input) return { values, added: [] };
  const known = new Set(Object.values(values.media).flat().map((m) => m.assetId));
  const current = values.media[input.id] ?? [];
  const room = Math.max(0, input.max - current.length);
  const fresh = assets
    .filter((a) => (a.kind === 'video' || a.kind === 'image') && input.accept.includes(a.kind) && !known.has(a.id))
    .slice(0, room);
  if (!fresh.length) return { values, added: [] };
  return {
    values: { ...values, media: { ...values.media, [input.id]: [...current, ...fresh.map((a) => ({ assetId: a.id, kind: a.kind as 'video' | 'image' }))] } },
    added: fresh.map((a) => a.id),
  };
}
