// A one-time, project-scoped handoff from the home gallery to recipe setup.
import { recipeForRatio, type Recipe } from '../../shared/reelsmith/recipe';
import type { RatioId } from '../../shared/reelsmith/ratios';
import type { ReelsBrief } from '../../shared/reelsmith/brief';
import type { ProjectDoc } from '../editor/types';

export interface RecipeStartHandoff { recipeId: string; ratio?: RatioId; brief?: ReelsBrief; prompt?: string }
const pending = new Map<string, RecipeStartHandoff>();
const key = (projectId: string) => `reelsmith:recipe-start:${projectId}`;

export function rememberRecipeStart(projectId: string, recipeId: string, details: Omit<RecipeStartHandoff, 'recipeId'> = {}): void {
  const handoff = { recipeId, ...details };
  pending.set(projectId, handoff);
  try { sessionStorage.setItem(key(projectId), JSON.stringify(handoff)); } catch { /* Memory works when storage is unavailable. */ }
}
export function pendingRecipeStart(projectId: string): string | undefined {
  return pendingRecipeHandoff(projectId)?.recipeId;
}
export function pendingRecipeHandoff(projectId: string): RecipeStartHandoff | undefined {
  const cached = pending.get(projectId);
  if (cached) return cached;
  try {
    const stored = sessionStorage.getItem(key(projectId));
    if (!stored) return undefined;
    try {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && typeof (parsed as RecipeStartHandoff).recipeId === 'string') {
        pending.set(projectId, parsed as RecipeStartHandoff);
        return parsed as RecipeStartHandoff;
      }
    } catch { /* Older releases stored just the recipe id. */ }
    const legacy = { recipeId: stored };
    pending.set(projectId, legacy);
    return legacy;
  } catch { return undefined; }
}
export function clearRecipeStart(projectId: string): void {
  pending.delete(projectId);
  try { sessionStorage.removeItem(key(projectId)); } catch { /* Optional storage. */ }
}

export function recipeProjectDoc(empty: ProjectDoc, recipe: Recipe, ratio?: RatioId): ProjectDoc {
  const selected = ratio ? recipeForRatio(recipe, ratio) : recipe;
  if (!selected) throw new Error(`${recipe.name} is not available in ${ratio}`);
  return { ...empty, timelines: empty.timelines.map((timeline) => ({ ...timeline,
    width: selected.canvas.width, height: selected.canvas.height, fps: selected.canvas.fps.num / selected.canvas.fps.den,
  })) };
}

export async function startRecipeProject(recipe: Recipe, deps: {
  create: (name: string, recipe: Recipe) => Promise<{ id: string }>;
  refresh: () => Promise<void>;
  open: (id: string) => void;
}, details: Omit<RecipeStartHandoff, 'recipeId'> = {}): Promise<void> {
  const ratio = details.ratio ?? details.brief?.target.ratio;
  if (ratio && !recipeForRatio(recipe, ratio)) throw new Error(`${recipe.name} is not available in ${ratio}`);
  const project = await deps.create(recipe.name, recipe);
  rememberRecipeStart(project.id, recipe.id, details);
  await deps.refresh();
  deps.open(project.id);
}
