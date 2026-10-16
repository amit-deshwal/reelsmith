import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReelsBrief } from '../../../shared/reelsmith/brief';
import type { Recipe } from '../../../shared/reelsmith/recipe';
import type { RatioId } from '../../../shared/reelsmith/ratios';
import { theme } from '../../theme';
import { bundledCatalog } from '../bundledRecipes';
import { localIdeaBrief, rankLocalIdeas, trendResearchPrompt } from '../../../shared/reelsmith/trendScout';
import { formatNotesDate, isStale, loadTrendNotes, parseTrendResults, saveTrendNotes, type TrendNotes } from '../../../shared/reelsmith/trendCache';
import { RecipeGallery } from './RecipeGallery';
import { listUserRecipes } from '../userRecipesApi';

type StartDetails = { ratio?: RatioId; brief?: ReelsBrief; prompt?: string };

export function RecipeHome({ onStartRecipe }: { onStartRecipe: (recipeId: string, details?: StartDetails) => Promise<void> }) {
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [clipCount, setClipCount] = useState(8);
  const [research, setResearch] = useState(false);
  const [userRecipes, setUserRecipes] = useState<Recipe[]>([]);
  const [notes, setNotes] = useState<TrendNotes | null>(() => { try { return loadTrendNotes(window.localStorage); } catch { return null; } });
  const [pasted, setPasted] = useState('');
  const [notesError, setNotesError] = useState('');
  const starting = useRef(false);
  const saveNotes = () => {
    const { briefs, errors } = parseTrendResults(pasted);
    if (!briefs.length) { setNotesError(errors.join('; ') || 'No briefs found.'); return; }
    let saved: TrendNotes | null = null;
    try { saved = saveTrendNotes(window.localStorage, topic, briefs); } catch { /* storage blocked */ }
    if (!saved) { setNotesError('Could not save notes in this browser.'); return; }
    setNotes(saved); setPasted(''); setNotesError(errors.join('; '));
  };
  const ideas = useMemo(() => rankLocalIdeas(bundledCatalog.recipes, topic), [topic]);
  useEffect(() => { void listUserRecipes().then((result) => setUserRecipes(result.recipes)).catch(() => {}); }, []);
  const start = async (recipeId: string, fromIdeas = false, ratio?: RatioId, forceResearch = false) => {
    if (starting.current) return;
    const recipe = [...bundledCatalog.recipes, ...userRecipes].find((candidate) => candidate.id === recipeId);
    if (!recipe) return;
    starting.current = true;
    setBusyId(recipeId); setError('');
    const doResearch = research || forceResearch;
    const options = { topic, availableClips: clipCount, research: doResearch };
    const brief = fromIdeas ? localIdeaBrief(recipe, options) : undefined;
    const prompt = fromIdeas && doResearch ? trendResearchPrompt(options, bundledCatalog.recipes) : undefined;
    try { await onStartRecipe(recipe.id, { ratio, ...(fromIdeas ? { brief, prompt } : {}) }); }
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
      <div aria-label="Saved trend notes" style={{ display: 'grid', gap: 6, padding: 8, border: `0.5px solid ${theme.border}`, borderRadius: 7 }}>
        <b style={{ fontSize: 12.5 }}>Saved trend notes{notes ? ` · ${formatNotesDate(notes)}` : ''}{notes && isStale(notes) ? ' · stale (over 14 days old)' : ''}</b>
        {notes ? <>
          {notes.topic && <span style={{ color: theme.textDim, fontSize: 11.5 }}>Topic: {notes.topic}</span>}
          {notes.briefs.map((brief, i) => <div key={i} style={{ fontSize: 11.5 }}>
            <b>{brief.target.recipeId}</b> {brief.target.ratio}: {brief.whyTrending ?? 'No reason given'}
            {brief.sources?.map((src) => /^https:\/\//.test(src.url) ? <span key={src.url}> · <a href={src.url} target="_blank" rel="noreferrer noopener" style={{ color: theme.text }}>{src.title}{src.publishedAt ? ` (${src.publishedAt})` : ''}</a></span> : null)}
          </div>)}
          <button type="button" disabled={!!busyId || !ideas[0]} onClick={() => { void start(ideas[0]!.id, true, undefined, true); }} style={button}>Refresh (sends topic to your agent)</button>
        </> : <span style={{ color: theme.textDim, fontSize: 11.5 }}>No saved notes yet. Paste the agent's JSON briefs below to keep them here.</span>}
        <textarea aria-label="Paste research briefs JSON" value={pasted} onChange={(event) => setPasted(event.target.value)} rows={2} placeholder="Paste briefs JSON from the agent" style={{ ...button, textAlign: 'left' }} />
        <button type="button" disabled={!pasted.trim()} onClick={saveNotes} style={button}>Save as trend notes</button>
        {notesError && <span role="alert" style={{ color: theme.danger, fontSize: 11.5 }}>{notesError}</span>}
      </div>
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
    <RecipeGallery recipes={[...bundledCatalog.recipes, ...userRecipes]} aiMadeIds={new Set(userRecipes.map((recipe) => recipe.id))} onSelect={(recipe, ratio) => { void start(recipe.id, false, ratio); }} disabled={!!busyId} />
  </section>;
}
