// RS-108: remember which recipe run produced a timeline, and re-cut one section of it.
// Stored beside the project (not inside ProjectDoc) so upstream migrations never strip it.
import type { AtomicAction, BatchAction } from '../editor/reducerActions';
import type { TimelineItem } from '../editor/types';
import { assemble } from './assembler';
import type { AssembleInput, RecipeRunRecord } from './assembler';

export interface Kv {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

const key = (projectId: string) => `reelsmith-run:${projectId}`;

export async function saveRun(kv: Kv, projectId: string, run: RecipeRunRecord): Promise<void> {
  await kv.set(key(projectId), run);
}

export async function loadRun(kv: Kv, projectId: string): Promise<RecipeRunRecord | null> {
  const v = await kv.get<RecipeRunRecord>(key(projectId));
  return v && typeof v.recipeId === 'string' && typeof v.seed === 'number' ? v : null;
}

/**
 * Replace the clips of one recipe section with a fresh pick (new seed).
 * Items outside the section, and anything the user added by hand, are left alone.
 */
export function recutSection(
  items: ReadonlyArray<TimelineItem>, input: AssembleInput, section: string, newSeed: number,
): BatchAction | null {
  const mine = items.filter((i) => i.props && (i.props as { rsSection?: string }).rsSection === section);
  const elsewhere = items
    .filter((i) => i.props && (i.props as { rsSection?: string }).rsSection && (i.props as { rsSection?: string }).rsSection !== section)
    .map((i) => i.sourceAssetId).filter((x): x is string => !!x);
  const res = assemble({ ...input, seed: newSeed, variety: 0.6, onlySection: { name: section, excludeAssetIds: elsewhere } });
  if (!res.action) return null;
  const removes: AtomicAction[] = mine.map((i) => ({ type: 'remove', id: i.id }));
  return { type: 'batch', label: `Re-cut ${section}`, actions: [...removes, ...res.action.actions] };
}
