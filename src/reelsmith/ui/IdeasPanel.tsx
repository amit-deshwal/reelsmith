// Ideas: describe the reel, tick a mood or two, and your Claude Code CLI picks recipes with a reason and the text
// filled in. Offline word matches show until (or instead of) the AI answer. Web trend research sits folded below.
import { useMemo, useRef, useState } from 'react';
import type { Recipe } from '../../../shared/reelsmith/recipe';
import { IDEA_VIBES, rankIdeasOffline, type IdeaAnswer, type IdeaRequest } from '../../../shared/reelsmith/ideaMatch';
import { formatNotesDate, isStale, loadTrendNotes, parseTrendResults, saveTrendNotes, sourceWarnings, type TrendNotes } from '../../../shared/reelsmith/trendCache';
import { theme } from '../../theme';
import { previewUrl } from '../galleryModel';
import { draftIdeaRecipe, IdeasUnavailableError, suggestRecipes } from '../ideasApi';

export interface IdeaStart { topic: string; clips: number; texts?: Record<string, string>; research?: boolean }

const button: React.CSSProperties = { padding: '7px 10px', borderRadius: 6, border: `0.5px solid ${theme.border}`, background: theme.panelAlt, color: theme.text, cursor: 'pointer' };
const primary: React.CSSProperties = { ...button, background: theme.accent, color: theme.onAccent, border: 'none', fontWeight: 600 };
const dim: React.CSSProperties = { color: theme.textDim, fontSize: 11.5, lineHeight: 1.45 };

export function IdeasPanel({ recipes, busyId, aiMadeIds, onUse, onRecipeDrafted }: {
  recipes: Recipe[];
  busyId: string;
  aiMadeIds: ReadonlySet<string>;
  onUse: (recipeId: string, idea: IdeaStart) => void;
  onRecipeDrafted: (recipe: Recipe) => void;
}) {
  const [description, setDescription] = useState('');
  const [vibes, setVibes] = useState<string[]>([]);
  const [clips, setClips] = useState(8);
  const [answer, setAnswer] = useState<IdeaAnswer | null>(null);
  const [asking, setAsking] = useState<'' | 'suggest' | 'draft'>('');
  const [note, setNote] = useState('');
  const [drafted, setDrafted] = useState<Recipe | null>(null);
  const abort = useRef<AbortController | null>(null);
  const request: IdeaRequest = { description, vibes, clips };
  const offline = useMemo(() => rankIdeasOffline({ description, vibes, clips }, recipes), [description, vibes, clips, recipes]);
  const shown = answer ?? offline;
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const canAsk = !!(description.trim() || vibes.length) && !asking;

  const run = async (kind: 'suggest' | 'draft') => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setAsking(kind); setNote('');
    try {
      if (kind === 'suggest') { setAnswer(await suggestRecipes(request, recipes, controller.signal)); setDrafted(null); }
      else { const recipe = await draftIdeaRecipe(request, recipes, controller.signal); setDrafted(recipe); onRecipeDrafted(recipe); }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      setNote(error instanceof IdeasUnavailableError ? `${message} Showing offline matches.` : message);
      if (kind === 'suggest') setAnswer(null);
    } finally {
      if (abort.current === controller) { abort.current = null; setAsking(''); }
    }
  };
  const toggleVibe = (id: string) => { setVibes((v) => v.includes(id) ? v.filter((x) => x !== id) : [...v, id]); setAnswer(null); };
  const cards = [
    ...(drafted ? [{ recipeId: drafted.id, why: 'New recipe drafted from your description and saved to your recipes.', texts: {} as Record<string, string> }] : []),
    ...shown.picks,
  ];

  return <div style={{ display: 'grid', gap: 10, padding: 14, marginBottom: 16, border: `0.5px solid ${theme.border}`, borderRadius: 8 }}>
    <div style={{ display: 'grid', gap: 2 }}>
      <b style={{ fontSize: 14 }}>Describe your reel</b>
      <span style={dim}>Say what it's about and how it should feel. Your Claude Code picks recipes and fills in the text.</span>
    </div>
    <textarea aria-label="Describe your reel" value={description} maxLength={600} rows={2}
      onChange={(event) => { setDescription(event.target.value); setAnswer(null); }}
      onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canAsk) { event.preventDefault(); void run('suggest'); } }}
      placeholder={'e.g. sunset weekend in Goa with friends, a bit retro. End line: "salt, sun, no signal"'}
      style={{ ...button, cursor: 'text', textAlign: 'left', resize: 'vertical', fontFamily: 'inherit', fontSize: 13, background: theme.inset }} />
    <div role="group" aria-label="Moods" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {IDEA_VIBES.map((vibe) => <button key={vibe.id} type="button" aria-pressed={vibes.includes(vibe.id)} onClick={() => toggleVibe(vibe.id)}
        style={{ ...button, padding: '4px 10px', borderRadius: 999, fontSize: 12,
          background: vibes.includes(vibe.id) ? theme.accent : theme.inset, color: vibes.includes(vibe.id) ? theme.onAccent : theme.text }}>{vibe.label}</button>)}
    </div>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" disabled={!canAsk} onClick={() => { void run('suggest'); }} style={{ ...primary, opacity: canAsk ? 1 : 0.5 }}>
        {asking === 'suggest' ? 'Asking Claude…' : 'Suggest recipes'}
      </button>
      <label style={{ ...dim, display: 'flex', gap: 6, alignItems: 'center' }}>
        About
        <input type="number" aria-label="Approximate number of clips" min={1} max={100} value={clips}
          onChange={(event) => setClips(Math.max(1, Math.min(100, event.target.valueAsNumber || 1)))} style={{ ...button, width: 56, padding: '4px 6px', cursor: 'text' }} />
        clips
      </label>
      {asking && <button type="button" onClick={() => { abort.current?.abort(); abort.current = null; setAsking(''); }} style={{ ...button, padding: '4px 9px', fontSize: 12 }}>Cancel</button>}
    </div>
    {note && <span role="alert" style={{ ...dim, color: theme.danger }}>{note}</span>}
    <span style={{ ...dim, fontWeight: 600 }}>{answer ? `Claude's picks${answer.noneFit ? ' · nothing fits closely, these are the nearest' : ''}` : 'Quick matches (offline)'}</span>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
      {cards.map((pick) => {
        const recipe = byId.get(pick.recipeId) ?? (drafted?.id === pick.recipeId ? drafted : undefined);
        if (!recipe) return null;
        return <IdeaCard key={recipe.id} recipe={recipe} why={pick.why} texts={pick.texts} aiMade={aiMadeIds.has(recipe.id) || recipe === drafted}
          busy={busyId === recipe.id} disabled={!!busyId} onUse={() => onUse(recipe.id, { topic: description, clips, texts: pick.texts })} />;
      })}
    </div>
    <span style={dim}>
      None of these?{' '}
      <button type="button" disabled={!canAsk} onClick={() => { void run('draft'); }} style={{ ...button, padding: '3px 8px', fontSize: 11.5 }}>
        {asking === 'draft' ? 'Drafting a new recipe…' : 'Make a new recipe with AI'}
      </button>
    </span>
    <TrendResearch topic={description} disabled={!!busyId || !shown.picks[0]} onResearch={() => onUse(shown.picks[0]!.recipeId, { topic: description, clips, research: true })} />
  </div>;
}

function IdeaCard({ recipe, why, texts, aiMade, busy, disabled, onUse }: {
  recipe: Recipe; why: string; texts: Record<string, string>; aiMade: boolean; busy: boolean; disabled: boolean; onUse: () => void;
}) {
  const [hover, setHover] = useState(false);
  const poster = previewUrl(recipe.preview?.poster);
  const loop = previewUrl(recipe.preview?.loop);
  const labels = new Map(recipe.inputs.map((input) => [input.id, input.label]));
  return <article onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 10, padding: 10, border: `0.5px solid ${theme.border}`, borderRadius: 8, background: theme.panelAlt }}>
    <div style={{ position: 'relative', aspectRatio: '9 / 16', borderRadius: 5, overflow: 'hidden', background: theme.inset, alignSelf: 'start' }}>
      {poster && <img src={poster} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      {hover && loop && <video src={loop} muted autoPlay loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
    </div>
    <div style={{ display: 'grid', gap: 6, alignContent: 'start', minWidth: 0 }}>
      <strong style={{ fontSize: 13 }}>{recipe.name}{aiMade && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: theme.accent, color: theme.onAccent }}>AI-made</span>}</strong>
      <span style={{ fontSize: 12, lineHeight: 1.4, color: theme.text }}>{why || recipe.description}</span>
      {Object.entries(texts).map(([id, text]) => <span key={id} style={{ ...dim, fontSize: 11 }}>{labels.get(id) ?? id}: <i style={{ color: theme.text }}>{text}</i></span>)}
      <button type="button" disabled={disabled} onClick={onUse} style={{ ...button, justifySelf: 'start', padding: '5px 12px' }}>{busy ? 'Starting…' : 'Use this'}</button>
    </div>
  </article>;
}

/** Opt-in web research by the editor agent, and the notes it saved (RS-1004/1005). Folded away by default. */
function TrendResearch({ topic, disabled, onResearch }: { topic: string; disabled: boolean; onResearch: () => void }) {
  const [notes, setNotes] = useState<TrendNotes | null>(() => { try { return loadTrendNotes(window.localStorage); } catch { return null; } });
  const [pasted, setPasted] = useState('');
  const [notesError, setNotesError] = useState('');
  const saveNotes = () => {
    const { briefs, errors } = parseTrendResults(pasted);
    if (!briefs.length) { setNotesError(errors.join('; ') || 'No briefs found.'); return; }
    let saved: TrendNotes | null = null;
    try { saved = saveTrendNotes(window.localStorage, topic, briefs); } catch { /* storage blocked */ }
    if (!saved) { setNotesError('Could not save notes in this browser.'); return; }
    setNotes(saved); setPasted(''); setNotesError([...errors, ...sourceWarnings(briefs)].join('; '));
  };
  return <details style={{ borderTop: `0.5px solid ${theme.border}`, paddingTop: 8 }}>
    <summary style={{ ...dim, cursor: 'pointer' }}>Web trend research{notes ? ` · notes from ${formatNotesDate(notes)}${isStale(notes) ? ' (stale)' : ''}` : ''}</summary>
    <div aria-label="Saved trend notes" style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      <span style={dim}>Opens a project with the top pick and asks your editor agent to research current Reels trends on the web for your description. It returns dated sources in the chat; no audio is downloaded.</span>
      <button type="button" disabled={disabled} onClick={onResearch} style={{ ...button, justifySelf: 'start' }}>Research trends for this</button>
      {notes && <>
        {notes.topic && <span style={dim}>Topic: {notes.topic}</span>}
        {notes.briefs.map((brief, i) => <div key={i} style={{ fontSize: 11.5 }}>
          <b>{brief.target.recipeId}</b> {brief.target.ratio}: {brief.whyTrending ?? 'No reason given'}
          {brief.sources?.map((src) => /^https:\/\//.test(src.url) ? <span key={src.url}> · <a href={src.url} target="_blank" rel="noreferrer noopener" style={{ color: theme.text }}>{src.title}{src.publishedAt ? ` (${src.publishedAt})` : ''}</a></span> : null)}
        </div>)}
      </>}
      <textarea aria-label="Paste research briefs JSON" value={pasted} onChange={(event) => setPasted(event.target.value)} rows={2} placeholder="Or paste briefs JSON from the agent" style={{ ...button, cursor: 'text', textAlign: 'left' }} />
      {pasted.trim() && <button type="button" onClick={saveNotes} style={{ ...button, justifySelf: 'start' }}>Save as trend notes</button>}
      {notesError && <span role="alert" style={{ ...dim, color: theme.danger }}>{notesError}</span>}
    </div>
  </details>;
}
