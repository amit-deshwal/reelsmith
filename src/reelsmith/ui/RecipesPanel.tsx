// Recipes tab: pick a recipe, choose pool media, tune params, press Assemble.
// Everything heavy lives in ../runRecipe.ts and ../assembler; this file is only the form.
import { useMemo, useState } from 'react';
import type { Recipe } from '../../../shared/reelsmith/recipe';
import type { BatchAction } from '../../editor/reducerActions';
import type { MediaAsset } from '../../editor/types';
import { theme } from '../../theme';
import { loadCatalog } from '../catalog';
import { buildGallery, categoryLabel } from '../galleryModel';
import { runRecipe, type AnalyzeApi } from '../runRecipe';
import { canAssemble, defaultValues, mediaInputs, validateSetup, widgetFor, type SetupValues } from '../setupForm';

const raw = import.meta.glob('/recipes/*.recipe.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const catalog = loadCatalog(raw);

async function post<T>(path: string, body: unknown): Promise<T | null> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) return null;
  return (await res.json()) as T;
}
const api: AnalyzeApi = {
  clipFeatures: async (a, fps) => (await post<{ features: never }>('/api/reelsmith/clip-features', { src: a.src, assetId: a.id, fps }))?.features ?? null,
  musicGrid: async (a) => (await post<{ grid: never }>('/api/reelsmith/music-grid', { src: a.src }))?.grid ?? null,
};

export interface RecipesPanelProps {
  assets: MediaAsset[];
  itemCount: number;
  fps: number;
  onApply: (action: BatchAction) => void;
}

const card: React.CSSProperties = {
  border: `0.5px solid ${theme.border}`, borderRadius: 8, background: theme.panelAlt, padding: 12, cursor: 'pointer',
  textAlign: 'left', color: theme.text, display: 'grid', gap: 4,
};
const label: React.CSSProperties = { fontSize: 11.5, color: theme.textDim };
const input: React.CSSProperties = {
  background: theme.inset, color: theme.text, border: `0.5px solid ${theme.border}`, borderRadius: 5, padding: '5px 7px', fontSize: 12.5,
};

export function RecipesPanel({ assets, itemCount, fps, onApply }: RecipesPanelProps) {
  const [category, setCategory] = useState<Recipe['category'] | 'all'>('all');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const gallery = useMemo(() => buildGallery(catalog.recipes, { category }), [category]);
  if (!recipe) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {gallery.categories.map((c) => (
            <button key={c.id} type="button" onClick={() => setCategory(c.id)} style={{
              ...input, cursor: 'pointer', background: category === c.id ? theme.accent : theme.inset,
              color: category === c.id ? theme.onAccent : theme.text,
            }}>{c.label} ({c.count})</button>
          ))}
        </div>
        {gallery.cards.map((c) => (
          <button key={c.id} type="button" style={card} onClick={() => setRecipe(catalog.recipes.find((r) => r.id === c.id)!)}>
            <b style={{ fontSize: 13.5 }}>{c.name}</b>
            <span style={label}>{categoryLabel(c.category)} · {c.aspect}{c.typicalLength ? ` · ${c.typicalLength}` : ''}</span>
            <span style={{ fontSize: 12 }}>{c.description}</span>
            <span style={{ ...label, color: theme.gold }}>Needs {c.requires}</span>
          </button>
        ))}
        {catalog.rejected.length > 0 && <div style={{ ...label, color: theme.danger }}>{catalog.rejected.join('; ')}</div>}
      </div>
    );
  }
  return <SetupForm key={recipe.id} recipe={recipe} assets={assets} itemCount={itemCount} fps={fps} onBack={() => setRecipe(null)} onApply={onApply} />;
}

function SetupForm({ recipe, assets, itemCount, fps, onBack, onApply }: RecipesPanelProps & { recipe: Recipe; onBack: () => void }) {
  const [values, setValues] = useState<SetupValues>(() => defaultValues(recipe));
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const errors = validateSetup(recipe, values);
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;
  const toggle = (inputId: string, a: MediaAsset, max: number) => setValues((v) => {
    const cur = v.media[inputId] ?? [];
    const has = cur.some((m) => m.assetId === a.id);
    const kind = a.kind as 'video' | 'image' | 'audio';
    const next = has ? cur.filter((m) => m.assetId !== a.id) : max === 1 ? [{ assetId: a.id, kind }] : [...cur, { assetId: a.id, kind }];
    return { ...v, media: { ...v.media, [inputId]: next } };
  });

  const assemble = async () => {
    if (itemCount > 0 && !window.confirm('Assembling replaces the current timeline. You can undo with ⌘Z. Continue?')) return;
    setBusy('Starting…'); setNotes([]);
    try {
      const out = await runRecipe(api, { recipe, values, assets, fps, replaceTimeline: true, onProgress: setBusy });
      setNotes(out.messages);
      if (out.action) onApply(out.action);
    } catch (e) {
      setNotes([e instanceof Error ? e.message : String(e)]);
    } finally { setBusy(''); }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 12, alignContent: 'start' }}>
      <button type="button" onClick={onBack} style={{ ...input, cursor: 'pointer', justifySelf: 'start' }}>← All recipes</button>
      <div><b style={{ fontSize: 14 }}>{recipe.name}</b><div style={label}>{recipe.description}</div></div>

      {mediaInputs(recipe).map((inp) => {
        const pool = assets.filter((a) => inp.accept.includes(a.kind as never));
        const chosen = values.media[inp.id] ?? [];
        return (
          <div key={inp.id} style={{ display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5 }}>{inp.label} <span style={label}>({inp.min === inp.max ? inp.max : `${inp.min}–${inp.max}`}, {chosen.length} chosen)</span></span>
              {inp.max > 1 && pool.length > 0 && (
                <button type="button" style={{ ...input, cursor: 'pointer' }} onClick={() => setValues((v) => ({
                  ...v, media: { ...v.media, [inp.id]: chosen.length === pool.length ? [] : pool.slice(0, inp.max).map((a) => ({ assetId: a.id, kind: a.kind as never })) },
                }))}>{chosen.length === pool.length ? 'None' : 'All'}</button>
              )}
            </div>
            {inp.hint && <span style={label}>{inp.hint}</span>}
            <div style={{ maxHeight: 150, overflowY: 'auto', border: `0.5px solid ${theme.border}`, borderRadius: 6 }}>
              {pool.length === 0 && <div style={{ ...label, padding: 8 }}>Import {inp.accept.join('/')} files in the My Media tab first.</div>}
              {pool.map((a) => (
                <label key={a.id} style={{ display: 'flex', gap: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer', alignItems: 'center' }}>
                  <input type={inp.max === 1 ? 'radio' : 'checkbox'} checked={chosen.some((m) => m.assetId === a.id)} onChange={() => toggle(inp.id, a, inp.max)} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.name}</span>
                  <span style={label}>{(a.durationInFrames / fps).toFixed(1)}s</span>
                </label>
              ))}
            </div>
            {errorFor(inp.id) && <span style={{ ...label, color: theme.danger }}>{errorFor(inp.id)}</span>}
          </div>
        );
      })}

      {recipe.inputs.filter((i) => i.kind === 'text').map((inp) => (
        <label key={inp.id} style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12.5 }}>{inp.label}{inp.kind === 'text' && inp.optional && !/optional/i.test(inp.label) ? ' (optional)' : ''}</span>
          <input style={input} placeholder={inp.kind === 'text' ? inp.placeholder : undefined} value={values.texts[inp.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, texts: { ...v.texts, [inp.id]: e.target.value } }))} />
          {errorFor(inp.id) && <span style={{ ...label, color: theme.danger }}>{errorFor(inp.id)}</span>}
        </label>
      ))}

      {recipe.params.map((p) => {
        const w = widgetFor(p);
        const set = (val: string | number | boolean) => setValues((v) => ({ ...v, params: { ...v.params, [p.id]: val } }));
        const cur = values.params[p.id];
        return (
          <label key={p.id} style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12.5 }}>{p.label}</span>
            {w === 'toggle' && <input type="checkbox" checked={cur === true} onChange={(e) => set(e.target.checked)} style={{ justifySelf: 'start' }} />}
            {w === 'select' && <select style={input} value={String(cur)} onChange={(e) => set(typeof p.options?.[0] === 'number' ? Number(e.target.value) : e.target.value)}>
              {p.options?.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}</select>}
            {w === 'color' && <input type="color" value={String(cur).slice(0, 7)} onChange={(e) => set(e.target.value.toUpperCase())} />}
            {w === 'font' && <input style={input} value={String(cur)} onChange={(e) => set(e.target.value)} />}
            {(w === 'slider' || w === 'stepper') && <input style={input} type="number" min={p.min} max={p.max} step={p.step ?? 1} value={Number(cur)} onChange={(e) => set(Number(e.target.value))} />}
            {errorFor(p.id) && <span style={{ ...label, color: theme.danger }}>{errorFor(p.id)}</span>}
          </label>
        );
      })}

      <button type="button" disabled={!canAssemble(recipe, values) || !!busy} onClick={() => { void assemble(); }} style={{
        padding: '9px 12px', borderRadius: 7, border: 'none', fontSize: 13.5, fontWeight: 600,
        cursor: canAssemble(recipe, values) && !busy ? 'pointer' : 'not-allowed',
        background: canAssemble(recipe, values) && !busy ? theme.accent : theme.panelAlt, color: canAssemble(recipe, values) && !busy ? theme.onAccent : theme.textDim,
      }}>{busy || 'Assemble'}</button>
      {notes.length > 0 && <ul style={{ margin: 0, paddingLeft: 16, ...label }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </div>
  );
}
