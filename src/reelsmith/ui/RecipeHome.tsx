import { useEffect, useRef, useState } from 'react';
import type { ReelsBrief } from '../../../shared/reelsmith/brief';
import type { Recipe } from '../../../shared/reelsmith/recipe';
import type { RatioId } from '../../../shared/reelsmith/ratios';
import { theme } from '../../theme';
import { bundledCatalog } from '../bundledRecipes';
import { localIdeaBrief, trendResearchPrompt } from '../../../shared/reelsmith/trendScout';
import { RecipeGallery } from './RecipeGallery';
import { IdeasPanel, type IdeaStart } from './IdeasPanel';
import { listUserRecipes } from '../userRecipesApi';

type StartDetails = { ratio?: RatioId; brief?: ReelsBrief; prompt?: string; texts?: Record<string, string> };

export function RecipeHome({ onStartRecipe }: { onStartRecipe: (recipeId: string, details?: StartDetails) => Promise<void> }) {
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [userRecipes, setUserRecipes] = useState<Recipe[]>([]);
  const starting = useRef(false);
  useEffect(() => { void listUserRecipes().then((result) => setUserRecipes(result.recipes)).catch(() => {}); }, []);
  const recipes = [...bundledCatalog.recipes, ...userRecipes];
  const aiMadeIds = new Set(userRecipes.map((recipe) => recipe.id));
  const start = async (recipeId: string, idea?: IdeaStart, ratio?: RatioId) => {
    if (starting.current) return;
    const recipe = recipes.find((candidate) => candidate.id === recipeId);
    if (!recipe) return;
    starting.current = true;
    setBusyId(recipeId); setError('');
    const options = idea && { topic: idea.topic, availableClips: idea.clips, research: !!idea.research };
    const details: StartDetails = options ? {
      brief: localIdeaBrief(recipe, options),
      ...(options.research ? { prompt: trendResearchPrompt(options, bundledCatalog.recipes) } : {}),
      ...(idea?.texts && Object.keys(idea.texts).length ? { texts: idea.texts } : {}),
    } : {};
    try { await onStartRecipe(recipe.id, { ratio, ...details }); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { starting.current = false; setBusyId(''); }
  };
  const button: React.CSSProperties = { padding: '7px 10px', borderRadius: 6, border: `0.5px solid ${theme.border}`, background: theme.panelAlt, color: theme.text, cursor: 'pointer' };
  return <section aria-label="Start from a recipe" style={{ marginBottom: 36 }}>
    <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Start with a recipe</h1>
    <p style={{ color: theme.textDim, fontSize: 13, margin: '0 0 12px' }}>Choose a style, add your clips and music, and assemble an editable reel. Not sure which? Describe it and let AI pick.</p>
    <button type="button" aria-expanded={ideasOpen} onClick={() => setIdeasOpen((open) => !open)} style={{ ...button, marginBottom: 12 }}>
      {ideasOpen ? 'Close' : '✦ Describe your reel · AI picks a recipe'}
    </button>
    {ideasOpen && <IdeasPanel recipes={recipes} busyId={busyId} aiMadeIds={aiMadeIds}
      onUse={(recipeId, idea) => { void start(recipeId, idea); }}
      onRecipeDrafted={(recipe) => setUserRecipes((list) => [...list.filter((r) => r.id !== recipe.id), recipe])} />}
    {error && <p role="alert" style={{ color: theme.danger }}>{error}</p>}
    {bundledCatalog.rejected.length > 0 && <p role="alert" style={{ color: theme.danger }}>{bundledCatalog.rejected.join('; ')}</p>}
    <RecipeGallery recipes={recipes} aiMadeIds={aiMadeIds} onSelect={(recipe, ratio) => { void start(recipe.id, undefined, ratio); }} disabled={!!busyId} />
  </section>;
}
