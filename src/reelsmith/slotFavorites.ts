// Starred ("favourite") media pool items act as the editor's selects: one click puts only those into a recipe slot.
import type { MediaAsset } from '../editor/types';
import type { SetupValues } from './setupForm';

type Selection = SetupValues['media'][string];

/** The starred assets of `pool` (at most `max`, in pool order) as a slot selection. */
export function favoritesSelection(pool: readonly MediaAsset[], max: number): Selection {
  return pool.filter((a) => a.favorite).slice(0, max).map((a) => ({ assetId: a.id, kind: a.kind as Selection[number]['kind'] }));
}

export const favoriteCount = (pool: readonly MediaAsset[]): number => pool.filter((a) => a.favorite).length;

/** True when the slot already holds exactly the starred assets (the button then clears them instead). */
export function isFavoritesSelected(pool: readonly MediaAsset[], max: number, chosen: Selection): boolean {
  const wanted = favoritesSelection(pool, max);
  return wanted.length > 0 && wanted.length === chosen.length && wanted.every((w) => chosen.some((c) => c.assetId === w.assetId));
}
