import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReelsBrief } from '../../../shared/reelsmith/brief';
import type { Recipe } from '../../../shared/reelsmith/recipe';
import { theme } from '../../theme';
import { bundledCatalog } from '../bundledRecipes';
import { localIdeaBrief, rankLocalIdeas, trendResearchPrompt } from '../../../shared/reelsmith/trendScout';
import { RecipeGallery } from './RecipeGallery';
import { listUserRecipes } from '../userRecipesApi';

type StartDetails = { brief?: ReelsBrief; prompt?: string };

export function RecipeHome({ onStartRecipe }: { onStartRecipe: (recipeId: string, details?: StartDetails) => Promise<void> }) {
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [clipCount, setClipCount] = useState(8);
  const [research, setResearch] = useState(false);
  const [userRecipes, setUserRecipes] = useState<Recipe[]>([]);
  const starting = useRef(false);
  const ideas = useMemo(() => rankLocalIdeas(bundledCatalog.recipes, topic), [topic]);
  useEffect(() => { void listUserRecipes().then((result) => setUserRecipes(result.recipes)).catch(() => {}); }, []);
  const start = async (recipeId: string, fromIdeas = false) => {
    if (starting.current) return;
    const recipe = bundledCatalog.recipes.find((candidate) => candidate.id === recipeId);
    if (!recipe) return;
    starting.current = true;
    setBusyId(recipeId); setError('');
    const options = { topic, availableClips: clipCount, research };
    const brief = fromIdeas ? localIdeaBrief(recipe, options) : undefined;
    const prompt = fromIdeas && research ? trendResearchPrompt(options, bundledCatalog.recipes) : undefined;
    try { await onStartRecipe(recipe.id, fromIdeas ? { brief, prompt } : undefined); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { starting.current = false; setBusyId(''); }
  };
  const button: React.CSSProperties = { padding: '7px 10px', borderRadius: 6, border: `0.5px solid ${theme.border}`, background: theme.panelAlt, color: theme.text, cursor: 'pointer' };
  return <section aria-label="Start from a recipe" style={{ marginBottom: 36 }}>
    <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Start with a recipe</h1>
    <p style={{ color: theme.textDim, fontSize: 13, margin: '0 0 12px' }}>Choose a style, add your clips and music, and assemble an editable reel. No AI required.</p>
    <button type="button" aria-expanded={ideasOpen} onClick={() => setIdeasOpen((open) => !open)} style={{ ...button, marginBottom: 12 }}>
      {ideasOpen ? 'Close Ideas' : 'Ideas · find a format'}
    </button>
    {ideasOpen && <div style={{ display: 'grid', gap: 9, padding: 12, marginBottom: 16, border: `0.5px solid ${theme.border}`, borderRadius: 8 }}>
      <b style={{ fontSize: 14 }}>Reels ideas</b>
      <label style={{ display: 'grid', gap: 4, color: theme.textDim, fontSize: 12 }}>
        What are you making?
        <input value={topic} maxLength={240} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. a weekend in Goa" style={{ ...button, textAlign: 'left' }} />
      </label>
      <label style={{ display: 'grid', gap: 4, color: theme.textDim, fontSize: 12 }}>
        Approximate number of clips
        <input type="number" min={1} max={100} value={clipCount} onChange={(event) => setClipCount(Math.max(1, Math.min(100, event.target.valueAsNumber || 1)))} style={{ ...button, width: 100, textAlign: 'left' }} />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: theme.text, fontSize: 12 }}>
        <input type="checkbox" checked={research} onChange={(event) => setResearch(event.target.checked)} /> Research current trends on the web
      </label>
      <span style={{ color: theme.textDim, fontSize: 11.5, lineHeight: 1.45 }}>
        {research
          ? 'Opting in sends your topic and clip count to your configured agent for web research. It will return dated sources in the editor chat; no audio is downloaded.'
          : 'Offline mode uses only bundled recipes and makes no research request.'}
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
        {ideas.map((recipe) => <article key={recipe.id} style={{ display: 'grid', gap: 7, padding: 10, border: `0.5px solid ${theme.border}`, borderRadius: 7, background: theme.panelAlt }}>
          <strong style={{ fontSize: 12.5 }}>{recipe.name}</strong>
          <span style={{ color: theme.textDim, fontSize: 11.5 }}>{recipe.description}</span>
          <button type="button" disabled={!!busyId} onClick={() => { void start(recipe.id, true); }} style={button}>
            {busyId === recipe.id ? 'Starting…' : research ? 'Research this idea' : 'Use this idea'}
          </button>
        </article>)}
      </div>
    </div>}
    {error && <p role="alert" style={{ color: theme.danger }}>{error}</p>}
    {bundledCatalog.rejected.length > 0 && <p role="alert" style={{ color: theme.danger }}>{bundledCatalog.rejected.join('; ')}</p>}
    <RecipeGallery recipes={[...bundledCatalog.recipes, ...userRecipes]} aiMadeIds={new Set(userRecipes.map((recipe) => recipe.id))} onSelect={(recipe) => { void start(recipe.id); }} disabled={!!busyId} />
  </section>;
}
