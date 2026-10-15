import { useRef, useState } from 'react';
import type { Recipe } from '../../../shared/reelsmith/recipe';
import { theme } from '../../theme';
import { bundledCatalog } from '../bundledRecipes';
import { RecipeGallery } from './RecipeGallery';

export function RecipeHome({ onStartRecipe }: { onStartRecipe: (recipeId: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const starting = useRef(false);
  const start = async (recipe: Recipe) => {
    if (starting.current) return;
    starting.current = true;
    setBusy(true); setError('');
    try { await onStartRecipe(recipe.id); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { starting.current = false; setBusy(false); }
  };
  return <section aria-label="Start from a recipe" style={{ marginBottom: 36 }}>
    <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Start with a recipe</h1>
    <p style={{ color: theme.textDim, fontSize: 13, margin: '0 0 18px' }}>Choose a style, add your clips and music, and assemble an editable reel. No AI required.</p>
    <RecipeGallery recipes={bundledCatalog.recipes} onSelect={(recipe) => { void start(recipe); }} disabled={busy} />
    {busy && <p role="status">Creating your project…</p>}
    {error && <p role="alert" style={{ color: theme.danger }}>{error}</p>}
    {bundledCatalog.rejected.length > 0 && <p role="alert" style={{ color: theme.danger }}>{bundledCatalog.rejected.join('; ')}</p>}
  </section>;
}
