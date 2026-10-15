// A one-time, project-scoped handoff from the home gallery to recipe setup.
import type { Recipe } from '../../shared/reelsmith/recipe';
import type { ProjectDoc } from '../editor/types';

const pending = new Map<string, string>();
const key = (projectId: string) => `reelsmith:recipe-start:${projectId}`;

export function rememberRecipeStart(projectId: string, recipeId: string): void {
  pending.set(projectId, recipeId);
  try { sessionStorage.setItem(key(projectId), recipeId); } catch { /* Memory works when storage is unavailable. */ }
}
export function pendingRecipeStart(projectId: string): string | undefined {
  try { return pending.get(projectId) ?? sessionStorage.getItem(key(projectId)) ?? undefined; }
  catch { return pending.get(projectId); }
}
export function clearRecipeStart(projectId: string): void {
  pending.delete(projectId);
  try { sessionStorage.removeItem(key(projectId)); } catch { /* Optional storage. */ }
}

export function recipeProjectDoc(empty: ProjectDoc, recipe: Recipe): ProjectDoc {
  return { ...empty, timelines: empty.timelines.map((timeline) => ({ ...timeline,
    width: recipe.canvas.width, height: recipe.canvas.height, fps: recipe.canvas.fps.num / recipe.canvas.fps.den,
  })) };
}

export async function startRecipeProject(recipe: Recipe, deps: {
  create: (name: string, recipe: Recipe) => Promise<{ id: string }>;
  refresh: () => Promise<void>;
  open: (id: string) => void;
}): Promise<void> {
  const project = await deps.create(recipe.name, recipe);
  rememberRecipeStart(project.id, recipe.id);
  await deps.refresh();
  deps.open(project.id);
}
