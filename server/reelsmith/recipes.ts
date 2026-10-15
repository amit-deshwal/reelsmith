// RS-101: load and validate the recipe manifests shipped in /recipes (and an optional user folder).
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRecipe, type Recipe } from '../../shared/reelsmith/recipe.ts';

export interface RecipeLoadResult {
  recipes: Recipe[];
  rejected: Array<{ file: string; errors: string[] }>;
}

export async function loadRecipesFromDir(dir: string): Promise<RecipeLoadResult> {
  const result: RecipeLoadResult = { recipes: [], rejected: [] };
  let names: string[];
  try { names = (await readdir(dir)).filter((n) => n.endsWith('.recipe.json')).sort(); }
  catch { return result; }
  const seen = new Set<string>();
  for (const file of names) {
    const parsed = parseRecipe(await readFile(join(dir, file), 'utf8'));
    if (!parsed.ok) { result.rejected.push({ file, errors: parsed.errors }); continue; }
    if (seen.has(parsed.recipe.id)) { result.rejected.push({ file, errors: [`duplicate recipe id "${parsed.recipe.id}"`] }); continue; }
    seen.add(parsed.recipe.id);
    result.recipes.push(parsed.recipe);
  }
  return result;
}
