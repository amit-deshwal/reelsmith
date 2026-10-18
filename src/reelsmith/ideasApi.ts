import type { IdeaAnswer, IdeaRequest } from '../../shared/reelsmith/ideaMatch';
import type { Recipe } from '../../shared/reelsmith/recipe';

/** Thrown when the CLI is missing or too old (503), so the panel can quietly fall back to offline matches. */
export class IdeasUnavailableError extends Error {}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/reelsmith/ideas${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (response.status === 503) throw new IdeasUnavailableError(result.error ?? 'Claude Code is not available');
  if (!response.ok) throw new Error(result.error ?? `Ideas request failed (${response.status})`);
  return result;
}

export function suggestRecipes(request: IdeaRequest, recipes: readonly Recipe[], signal?: AbortSignal): Promise<IdeaAnswer> {
  return post('', { ...request, recipes }, signal);
}

export async function draftIdeaRecipe(request: IdeaRequest, recipes: readonly Recipe[], signal?: AbortSignal): Promise<Recipe> {
  return (await post<{ recipe: Recipe }>('/draft-recipe', { ...request, recipes }, signal)).recipe;
}
