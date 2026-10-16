import type { Recipe } from '../../shared/reelsmith/recipe';

async function request<T>(body?: unknown, method = 'GET'): Promise<T> {
  const response = await fetch('/api/reelsmith/user-recipes', {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? `User recipe request failed (${response.status})`);
  return result;
}

export async function listUserRecipes(): Promise<{ recipes: Recipe[]; rejected: Array<{ file: string; errors: string[] }> }> {
  return request(undefined, 'GET');
}
export async function saveUserRecipe(recipe: Recipe, replace = false): Promise<Recipe> {
  const result = await request<{ recipe: Recipe }>({ recipe, replace }, 'POST');
  return result.recipe;
}
export async function deleteUserRecipe(id: string): Promise<void> {
  await request<{ deleted: boolean }>({ id }, 'DELETE');
}
