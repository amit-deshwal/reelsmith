// Recipes tab: pick a recipe, choose pool media, tune params, press Assemble.
// Everything heavy lives in ../runRecipe.ts and ../assembler; this file is only the form.
import { useRef, useState } from 'react';
import type { Recipe, RecipeMediaInput } from '../../../shared/reelsmith/recipe';
import type { BatchAction } from '../../editor/reducerActions';
import type { MediaAsset } from '../../editor/types';
import { theme } from '../../theme';
import { analyzeApi } from '../analyzeApi';
import { bundledCatalog } from '../bundledRecipes';
import { RecipeGallery } from './RecipeGallery';
import { MusicPolicyControls } from './MusicPolicyControls';
import { runRecipe } from '../runRecipe';
import { requestPreview } from '../previewClient';
import { saveRun } from '../runStore';
import { kvGet, kvSet } from '../../persist/sharedKv';
import { importSlotMedia } from '../slotImport';
import { canAssemble, defaultValues, mediaInputs, validateSetup, widgetFor, type SetupValues } from '../setupForm';

const catalog = bundledCatalog;
const api = analyzeApi;

export interface RecipesPanelProps {
  projectId: string;
  assets: MediaAsset[];
  itemCount: number;
  fps: number;
  onApply: (action: BatchAction) => void;
  /** prefill the chat with a request (agent shot selection) */
  onAskAgent?: (text: string, opts?: { autoSend?: boolean }) => void;
  initialRecipeId?: string;
  onImportMedia?: (file: File) => Promise<MediaAsset>;
}

export const AGENT_PICK_PROMPT = [
  'Choose the shots for the reel I just assembled from a recipe.',
  'Call reels_selection_candidates, look at the candidates (view_asset_frames on the ones you are unsure about),',
  'Respect framesAllowed: when it is false, work from names, scores and transcripts without requesting pictures.',
  'Then call propose_selection with the returned selectionKey and the best assetIds in shot order, varied, no near-duplicates.',
  'For a captioned story, choose brollAssetIds separately using brollCandidates and brollSlots.',
  'If the candidates list textInputs, also check that text against the recipe hints: when it needs rewording to fit (for example split into phrases with "/"), or is empty, pass the improved text as texts in propose_selection.',
  "Keep the user's own words and order; when writing a missing line, describe only what the clips show (no invented names, places or dates).",
  'Tell me in one or two lines why.',
].join(' ');

const label: React.CSSProperties = { fontSize: 11.5, color: theme.textDim };
const input: React.CSSProperties = {
  background: theme.inset, color: theme.text, border: `0.5px solid ${theme.border}`, borderRadius: 5, padding: '5px 7px', fontSize: 12.5,
};

export function RecipesPanel({ projectId, assets, itemCount, fps, onApply, onAskAgent, initialRecipeId, onImportMedia }: RecipesPanelProps) {
  const [recipe, setRecipe] = useState<Recipe | null>(() => catalog.recipes.find((r) => r.id === initialRecipeId) ?? null);
  if (!recipe) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
        <RecipeGallery recipes={catalog.recipes} onSelect={setRecipe} />
        {catalog.rejected.length > 0 && <div style={{ ...label, color: theme.danger }}>{catalog.rejected.join('; ')}</div>}
      </div>
    );
  }
  return <SetupForm key={recipe.id} recipe={recipe} projectId={projectId} assets={assets} itemCount={itemCount} fps={fps} onBack={() => setRecipe(null)} onImportMedia={onImportMedia} onApply={onApply} onAskAgent={onAskAgent} />;
}

export function SetupForm({ recipe, projectId, assets, itemCount, fps, onBack, onApply, onAskAgent, onImportMedia }: RecipesPanelProps & { recipe: Recipe; onBack: () => void }) {
  const [values, setValues] = useState<SetupValues>(() => defaultValues(recipe));
  const [busy, setBusy] = useState('');
  const working = useRef(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ src: string; ms: number } | null>(null);
  const errors = validateSetup(recipe, values, assets);
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;
  const toggle = (inputId: string, a: MediaAsset, max: number) => setValues((v) => {
    const cur = v.media[inputId] ?? [];
    const has = cur.some((m) => m.assetId === a.id);
    const kind = a.kind as 'video' | 'image' | 'audio';
    const next = has ? cur.filter((m) => m.assetId !== a.id) : max === 1 ? [{ assetId: a.id, kind }] : [...cur, { assetId: a.id, kind }];
    return { ...v, media: { ...v.media, [inputId]: next } };
  });

  const importFiles = async (slot: RecipeMediaInput, files: File[]) => {
    if (!onImportMedia || !files.length || working.current) return;
    working.current = true;
    setBusy('Importing…'); setNotes([]); setPreview(null);
    try {
      const result = await importSlotMedia(slot, values.media[slot.id] ?? [], files, onImportMedia, setBusy);
      setValues((v) => ({ ...v, media: { ...v.media, [slot.id]: result.selected } }));
      setNotes(result.messages);
    } finally { working.current = false; setBusy(''); }
  };

  const assemble = async () => {
    if (working.current || errors.length) return;
    if (itemCount > 0 && !window.confirm('Assembling replaces the current timeline. You can undo with ⌘Z. Continue?')) return;
    working.current = true;
    setBusy('Starting…'); setNotes([]);
    try {
      const out = await runRecipe(api, { recipe, values, assets, fps, replaceTimeline: true, onProgress: setBusy });
      setNotes(out.messages);
      if (out.action) {
        onApply(out.action);
        // RS-108: remember the run so chat can re-cut sections or re-pick shots
        await saveRun({ get: kvGet, set: kvSet }, projectId, out.run).catch(() => setNotes((n) => [...n, 'Could not save the recipe run; re-cut from chat will not work.']));
        if (values.agentPick !== 'off' && onAskAgent) {
          onAskAgent(AGENT_PICK_PROMPT, { autoSend: true });
          setNotes((n) => [...n, 'The reel is assembled. Your agent is now choosing the shots in the chat, in one undo step. If it has not started, press Enter there.']);
        }
      }
    } catch (e) {
      setNotes([e instanceof Error ? e.message : String(e)]);
    } finally { working.current = false; setBusy(''); }
  };

  const previewWithMine = async () => {
    if (working.current || errors.length) return;
    working.current = true;
    setBusy('Preparing preview…'); setNotes([]); setPreview(null);
    const started = performance.now();
    try {
      const out = await runRecipe(api, { recipe, values, assets, fps, replaceTimeline: false, onProgress: setBusy });
      if (!out.action) { setNotes(out.messages); return; }
      setBusy('Rendering preview…');
      const p = await requestPreview(out, assets, fps);
      setPreview({ src: p.src, ms: Math.round(performance.now() - started) });
      setNotes(out.messages);
    } catch (e) {
      setNotes([e instanceof Error ? e.message : String(e)]);
    } finally { working.current = false; setBusy(''); }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
      <fieldset aria-label={`${recipe.name} setup`} disabled={!!busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 12 }}>
        <button type="button" onClick={onBack} style={{ ...input, cursor: 'pointer', justifySelf: 'start' }}>← All recipes</button>
        <div><b style={{ fontSize: 14 }}>{recipe.name}</b><div style={label}>{recipe.description}</div></div>

        {mediaInputs(recipe).map((inp) => {
          const pool = assets.filter((a) => inp.accept.includes(a.kind as never));
          const chosen = values.media[inp.id] ?? [];
          const candidates = pool.slice(0, inp.max);
          const allSelected = candidates.length > 0 && candidates.every((a) => chosen.some((m) => m.assetId === a.id));
          return (
            <div key={inp.id} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5 }}>{inp.label} <span style={label}>({inp.min === inp.max ? inp.max : `${inp.min}–${inp.max}`}, {chosen.length} chosen)</span></span>
                {inp.max > 1 && pool.length > 0 && (
                  <button type="button" style={{ ...input, cursor: 'pointer' }} onClick={() => setValues((v) => ({
                    ...v, media: { ...v.media, [inp.id]: allSelected ? [] : candidates.map((a) => ({ assetId: a.id, kind: a.kind as never })) },
                  }))}>{allSelected ? 'None' : 'All'}</button>
                )}
              </div>
              {onImportMedia && <label style={{ ...label, display: 'grid', gap: 4 }}>
                Import files for {inp.label}
                <input type="file" aria-label={`Import ${inp.label}`} accept={inp.accept.map((kind) => `${kind}/*`).join(',')}
                  multiple={inp.max > 1} style={{ ...input, minWidth: 0, width: '100%', boxSizing: 'border-box' }}
                  onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void importFiles(inp, files); }} />
              </label>}
              {chosen.length > 0 && <button type="button" style={{ ...input, justifySelf: 'start', cursor: 'pointer' }}
                onClick={() => setValues((v) => ({ ...v, media: { ...v.media, [inp.id]: [] } }))}>Clear selection</button>}
              {inp.hint && <span style={label}>{inp.hint}</span>}
              <div style={{ maxHeight: 150, overflowY: 'auto', border: `0.5px solid ${theme.border}`, borderRadius: 6 }}>
                {pool.length === 0 && <div style={{ ...label, padding: 8 }}>{onImportMedia ? 'Import files above or choose existing files from My Media.' : `Import ${inp.accept.join('/')} files in the My Media tab first.`}</div>}
                {pool.map((a) => (
                  <label key={a.id} style={{ display: 'flex', gap: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer', alignItems: 'center' }}>
                    <input type={inp.max === 1 ? 'radio' : 'checkbox'} disabled={inp.max > 1 && chosen.length >= inp.max && !chosen.some((m) => m.assetId === a.id)} checked={chosen.some((m) => m.assetId === a.id)} onChange={() => toggle(inp.id, a, inp.max)} />
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
            <input style={input} maxLength={inp.kind === 'text' ? inp.maxLength : undefined} placeholder={inp.kind === 'text' ? inp.placeholder : undefined} value={values.texts[inp.id] ?? ''}
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
              {(w === 'slider' || w === 'stepper') && <input style={input} type="number" min={p.min} max={p.max} step={p.step ?? 1} value={Number.isFinite(cur) ? Number(cur) : ''} onChange={(e) => set(e.target.valueAsNumber)} />}
              {errorFor(p.id) && <span style={{ ...label, color: theme.danger }}>{errorFor(p.id)}</span>}
            </label>
          );
        })}

        {recipe.music && (
          <MusicPolicyControls params={values.params} errorFor={errorFor} canFitBars={recipe.assembler.strategy.startsWith('beat-montage')}
            onChange={(id, val) => setValues((v) => ({ ...v, params: { ...v.params, [id]: val } }))} />
        )}

        {(recipe.assembler.aiSelection ?? 'optional') !== 'off' && onAskAgent && (
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12.5 }}>Let my agent choose the shots</span>
            <select style={input} value={values.agentPick} onChange={(e) => setValues((v) => ({ ...v, agentPick: e.target.value as SetupValues['agentPick'] }))}>
              <option value="off">Off (automatic pick)</option>
              <option value="claude">Claude</option>
            </select>
            {values.agentPick !== 'off' && <span style={label}>Assembles automatically first, then asks your agent in the chat to re-pick. Frames of your clips may be sent to the agent.</span>}
          </label>
        )}

        <button type="button" disabled={!canAssemble(recipe, values, assets) || !!busy} onClick={() => { void assemble(); }} style={{
          padding: '9px 12px', borderRadius: 7, border: 'none', fontSize: 13.5, fontWeight: 600,
          cursor: canAssemble(recipe, values, assets) && !busy ? 'pointer' : 'not-allowed',
          background: canAssemble(recipe, values, assets) && !busy ? theme.accent : theme.panelAlt, color: canAssemble(recipe, values, assets) && !busy ? theme.onAccent : theme.textDim,
        }}>{busy || 'Assemble'}</button>
        <button type="button" disabled={!canAssemble(recipe, values, assets) || !!busy} onClick={() => { void previewWithMine(); }}
          style={{ ...input, cursor: canAssemble(recipe, values, assets) && !busy ? 'pointer' : 'not-allowed', justifySelf: 'stretch', padding: '7px 10px' }}>
          Preview with my footage
        </button>
      </fieldset>
      {busy && <p role="status" style={label}>{busy}</p>}
      {preview && (
        <div style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
          <video src={preview.src} muted autoPlay loop playsInline style={{ width: 180, aspectRatio: '9 / 16', borderRadius: 8, background: '#000' }} />
          <span style={label}>Preview ready in {(preview.ms / 1000).toFixed(1)} s. Nothing was added to the timeline.</span>
        </div>
      )}
      {notes.length > 0 && <ul role="status" style={{ margin: 0, paddingLeft: 16, ...label }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </div>
  );
}
