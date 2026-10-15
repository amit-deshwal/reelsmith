// Recipes bundled with the app. The glob is resolved by Vite at build time; validation happens here at load.
import { parseRecipe, type Recipe } from '../../shared/reelsmith/recipe';

export function loadCatalog(raw: Record<string, string>): { recipes: Recipe[]; rejected: string[] } {
  const recipes: Recipe[] = [];
  const rejected: string[] = [];
  for (const [path, text] of Object.entries(raw).sort(([a], [b]) => a.localeCompare(b))) {
    const parsed = parseRecipe(text);
    if (parsed.ok) recipes.push(parsed.recipe);
    else rejected.push(`${path}: ${parsed.errors[0]}`);
  }
  return { recipes, rejected };
}
