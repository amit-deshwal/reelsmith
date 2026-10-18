// Recipes tab: pick a recipe, choose pool media, tune params, press Assemble.
// Everything heavy lives in ../runRecipe.ts and ../assembler; this file is only the form.
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseRecipe, supportedRatios, type Recipe, type RecipeMediaInput } from '../../../shared/reelsmith/recipe';
import { RATIO_SIZES, type RatioId } from '../../../shared/reelsmith/ratios';
import { mapBriefToRecipe, type ReelsBrief } from '../../../shared/reelsmith/brief';
import type { BatchAction } from '../../editor/reducerActions';
import type { MediaAsset, TimelineItem } from '../../editor/types';
import { theme } from '../../theme';
import { analyzeApi } from '../analyzeApi';
import { briefChecklist } from '../briefChecklist';
import { bundledCatalog } from '../bundledRecipes';
import { deleteUserRecipe, listUserRecipes, saveUserRecipe } from '../userRecipesApi';
import { RecipeGallery } from './RecipeGallery';
import { MusicPolicyControls } from './MusicPolicyControls';
import { ENHANCE_PHOTOS_PARAM, MISMATCH_FIT_PARAM, mismatchFitOf, runRecipe } from '../runRecipe';
import { loadShotTags } from '../shotTagApi';
import { LooksPanel } from './LooksPanel';
import { requestPreview } from '../previewClient';
import { loadRun, saveRun } from '../runStore';
import { kvGet, kvSet } from '../../persist/sharedKv';
import { importSlotMedia } from '../slotImport';
import { favoriteCount, favoritesSelection, isFavoritesSelected } from '../slotFavorites';
import { canAssemble, defaultValues, mediaInputs, validateSetup, widgetFor, type SetupValues } from '../setupForm';

const catalog = bundledCatalog;
const api = analyzeApi;

export interface RecipesPanelProps {
  projectId: string;
  assets: MediaAsset[];
  itemCount: number;
  /** timeline clips and the selected one, for Reel looks */
  items?: readonly TimelineItem[];
  selectedItem?: TimelineItem | null;
  fps: number;
  onApply: (action: BatchAction) => void;
  /** prefill the chat with a request (agent shot selection) */
  onAskAgent?: (text: string, opts?: { autoSend?: boolean }) => void;
  initialRecipeId?: string;
  initialRatio?: RatioId;
  /** Optional guided brief supplied by the gallery or Ideas flow. */
  initialBrief?: ReelsBrief;
  /** One-time prompt from an opted-in Ideas research handoff. */
  initialPrompt?: string;
  /** Text inputs prefilled by an Ideas pick (title, place name), keyed by input id. */
  initialTexts?: Record<string, string>;
  onImportMedia?: (file: File) => Promise<MediaAsset>;
}

export const AGENT_PICK_PROMPT = [
  'Choose the shots for the reel I just assembled from a recipe.',
  'Call reels_selection_candidates, then (when framesAllowed) reels_selection_sheet once to see the best candidates in a single numbered contact sheet; do not inspect clips one by one,',
  'Respect framesAllowed: when it is false, work from names, scores and transcripts without requesting pictures.',
  'Then call propose_selection with the returned selectionKey and the best assetIds in shot order, varied, no near-duplicates.',
  'For a captioned story, choose brollAssetIds separately using brollCandidates and brollSlots.',
  'If the candidates list textInputs, also check that text against the recipe hints: when it needs rewording to fit (for example split into phrases with "/"), or is empty, pass the improved text as texts in propose_selection.',
  "Keep the user's own words and order; when writing a missing line, describe only what the clips show (no invented names, places or dates).",
  'Tell me in one or two lines why.',
].join(' ');

/** Starter text for "Plan a reel": the user finishes the sentence, the reels-editor skill does the rest. */
export const PLAN_REEL_STARTER = 'Plan a reel for me with the clips I imported. It is about: ';

const AI_RECIPE_PROMPT = [
  'Draft one new Reelsmith recipe manifest as JSON only. Use schemaVersion 1, an id beginning with "ai-", a supported category, 9:16 canvas, declared inputs and params, existing assembler strategy only (beat-montage@1, story-vlog@1, captioned-story@1, collage-grid@1, or travel-diary@1), valid structure/styles, and no executable code or external file paths.',
  'Keep it practical for ordinary imported clips. Use only existing layout, transition, overlay and animation values from the bundled recipes. Include a concise name, description, required media and optional text inputs. I will validate the JSON before saving it.',
].join(' ');

const label: React.CSSProperties = { fontSize: 11.5, color: theme.textDim };
const input: React.CSSProperties = {
  background: theme.inset, color: theme.text, border: `0.5px solid ${theme.border}`, borderRadius: 5, padding: '5px 7px', fontSize: 12.5,
};

export function RecipesPanel({ projectId, assets, itemCount, items, selectedItem, fps, onApply, onAskAgent, initialRecipeId, initialRatio, initialBrief, initialPrompt, initialTexts, onImportMedia }: RecipesPanelProps) {
  const selectedRecipeId = initialRecipeId ?? (initialBrief?.target.recipeId !== 'new' ? initialBrief?.target.recipeId : undefined);
  const [recipe, setRecipe] = useState<Recipe | null>(() => catalog.recipes.find((r) => r.id === selectedRecipeId) ?? null);
  const [chosenRatio, setChosenRatio] = useState<RatioId | undefined>(initialRatio ?? initialBrief?.target.ratio);
  const [userRecipes, setUserRecipes] = useState<Recipe[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managerError, setManagerError] = useState('');
  const [managerBusy, setManagerBusy] = useState(false);
  useEffect(() => {
    void listUserRecipes().then((result) => {
      setUserRecipes(result.recipes);
      if (result.rejected.length) setManagerError(result.rejected.map((entry) => `${entry.file}: ${entry.errors.join('; ')}`).join('\n'));
    }).catch((error) => setManagerError(error instanceof Error ? error.message : String(error)));
  }, []);
  const saveDraft = async () => {
    setManagerError('');
    const parsed = parseRecipe(draft);
    if (!parsed.ok) { setManagerError(parsed.errors.join('; ')); return; }
    const allIds = new Set([...catalog.recipes, ...userRecipes].map((entry) => entry.id));
    const slug = parsed.recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'recipe';
    const id = editingId ?? `ai-${slug}-${crypto.randomUUID().slice(0, 8)}`;
    if (!editingId && allIds.has(id)) { setManagerError('A recipe with this id already exists. Try saving again.'); return; }
    const candidate = { ...parsed.recipe, id };
    const normalized = parseRecipe(JSON.stringify(candidate));
    if (!normalized.ok) { setManagerError(normalized.errors.join('; ')); return; }
    setManagerBusy(true);
    try {
      const saved = await saveUserRecipe(normalized.recipe, !!editingId);
      setUserRecipes((current) => [...current.filter((entry) => entry.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft(''); setEditingId(null);
    } catch (error) { setManagerError(error instanceof Error ? error.message : String(error)); }
    finally { setManagerBusy(false); }
  };
  const duplicate = async (source: Recipe) => {
    const slug = source.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'recipe';
    const copy = { ...source, id: `ai-${slug}-copy-${crypto.randomUUID().slice(0, 6)}`, name: `${source.name.slice(0, 54)} copy` };
    setManagerBusy(true); setManagerError('');
    try {
      const saved = await saveUserRecipe(copy);
      setUserRecipes((current) => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) { setManagerError(error instanceof Error ? error.message : String(error)); }
    finally { setManagerBusy(false); }
  };
  const removeUserRecipe = async (entry: Recipe) => {
    if (!window.confirm(`Delete the AI-made recipe “${entry.name}”?`)) return;
    setManagerBusy(true); setManagerError('');
    try {
      await deleteUserRecipe(entry.id);
      setUserRecipes((current) => current.filter((candidate) => candidate.id !== entry.id));
    } catch (error) { setManagerError(error instanceof Error ? error.message : String(error)); }
    finally { setManagerBusy(false); }
  };
  if (!recipe) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
        {onAskAgent && <section aria-label="Plan a reel" style={{ display: 'grid', gap: 6, padding: 10, border: `0.5px solid ${theme.border}`, borderRadius: 8 }}>
          <b style={{ fontSize: 13 }}>Plan a reel</b>
          <span style={label}>Tell your agent what the reel is about. It looks at your imported media, picks a recipe, writes the text and builds it. Nothing to copy or paste.</span>
          <button type="button" onClick={() => onAskAgent(PLAN_REEL_STARTER)} style={{ ...input, cursor: 'pointer', justifySelf: 'start' }}>Plan a reel with my agent</button>
        </section>}
        {items && <LooksPanel items={items} selectedItem={selectedItem ?? null} onApply={onApply} />}
        <RecipeGallery recipes={[...catalog.recipes, ...userRecipes]} onSelect={(selected, ratio) => {
          setRecipe(selected);
          setChosenRatio(ratio ?? (initialRatio && supportedRatios(selected).includes(initialRatio) ? initialRatio : undefined));
        }} aiMadeIds={new Set(userRecipes.map((entry) => entry.id))} disabled={managerBusy} />
        <section aria-label="AI-made recipes" style={{ display: 'grid', gap: 8, padding: 10, border: `0.5px solid ${theme.border}`, borderRadius: 8 }}>
          <b style={{ fontSize: 13 }}>AI-made recipes</b>
          <span style={label}>Paste recipe JSON drafted by your agent. It is validated before it is saved locally, outside the bundled recipes.</span>
          {onAskAgent && <button type="button" disabled={managerBusy} onClick={() => onAskAgent(AI_RECIPE_PROMPT)} style={{ ...input, cursor: 'pointer', justifySelf: 'start' }}>Ask agent to draft a recipe</button>}
          {userRecipes.map((entry) => <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 100, fontSize: 12 }}>{entry.name}</span>
            <button type="button" disabled={managerBusy} style={{ ...input, cursor: 'pointer' }} onClick={() => { setEditingId(entry.id); setDraft(JSON.stringify(entry, null, 2)); }}>Edit</button>
            <button type="button" disabled={managerBusy} style={{ ...input, cursor: 'pointer' }} onClick={() => { void duplicate(entry); }}>Duplicate</button>
            <button type="button" disabled={managerBusy} style={{ ...input, cursor: 'pointer' }} onClick={() => { void removeUserRecipe(entry); }}>Delete</button>
          </div>)}
          <textarea aria-label="AI-made recipe JSON" value={draft} onChange={(event) => setDraft(event.target.value)} rows={10} spellCheck={false}
            placeholder="Paste a recipe JSON object from your agent…" style={{ ...input, resize: 'vertical', fontFamily: 'monospace', fontSize: 11.5 }} />
          <div style={{ display: 'flex', gap: 7 }}>
            <button type="button" disabled={managerBusy || !draft.trim()} onClick={() => { void saveDraft(); }} style={{ ...input, cursor: 'pointer' }}>{managerBusy ? 'Saving…' : editingId ? 'Save changes' : 'Validate and save'}</button>
            {editingId && <button type="button" disabled={managerBusy} onClick={() => { setEditingId(null); setDraft(''); }} style={{ ...input, cursor: 'pointer' }}>Cancel</button>}
          </div>
          {managerError && <span role="alert" style={{ ...label, color: theme.danger }}>{managerError}</span>}
        </section>
        {catalog.rejected.length > 0 && <div style={{ ...label, color: theme.danger }}>{catalog.rejected.join('; ')}</div>}
      </div>
    );
  }
  return <SetupForm key={recipe.id} recipe={recipe} projectId={projectId} assets={assets} itemCount={itemCount} fps={fps} initialRatio={chosenRatio} initialBrief={initialBrief} initialPrompt={initialPrompt} initialTexts={initialTexts} onBack={() => setRecipe(null)} onImportMedia={onImportMedia} onApply={onApply} onAskAgent={onAskAgent} />;
}

export function SetupForm({ recipe, projectId, assets, itemCount, fps, initialRatio, initialBrief, initialPrompt, initialTexts, onBack, onApply, onAskAgent, onImportMedia }: RecipesPanelProps & { recipe: Recipe; onBack: () => void }) {
  const ratios = supportedRatios(recipe);
  const [ratio, setRatio] = useState<RatioId>(() => ratios.includes(initialRatio as RatioId) ? initialRatio! : ratios[0]!);
  const [values, setValues] = useState<SetupValues>(() => { const v = defaultValues(recipe); return initialTexts ? { ...v, texts: { ...v.texts, ...initialTexts } } : v; });
  const [busy, setBusy] = useState('');
  const working = useRef(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ src: string; ms: number } | null>(null);
  const [brief, setBrief] = useState<ReelsBrief | undefined>(initialBrief);
  const [confirmedShotRequests, setConfirmedShotRequests] = useState<number[]>([]);
  const [assembleAnyway, setAssembleAnyway] = useState(false);
  const promptSent = useRef(false);
  useEffect(() => {
    if (!initialPrompt || !onAskAgent || promptSent.current) return;
    promptSent.current = true;
    onAskAgent(initialPrompt, { autoSend: true });
  }, [initialPrompt, onAskAgent]);
  useEffect(() => {
    if (initialBrief) return;
    let active = true;
    void loadRun({ get: kvGet, set: kvSet }, projectId).then((run) => {
      if (!active || run?.recipeId !== recipe.id || !run.brief) return;
      setBrief(run.brief);
      setConfirmedShotRequests(run.briefConfirmedShotRequests ?? []);
    }).catch(() => {});
    return () => { active = false; };
  }, [initialBrief, projectId, recipe.id]);
  const briefMapping = useMemo(() => brief ? mapBriefToRecipe(brief, { ...recipe, canvas: { ...recipe.canvas, ...RATIO_SIZES[ratio] } }) : null, [brief, recipe, ratio]);
  const { items: briefItems, complete: briefComplete } = briefChecklist(brief, briefMapping, values, assets, fps, confirmedShotRequests);
  const errors = validateSetup(recipe, values, assets);
  const canStartAssembly = canAssemble(recipe, values, assets) && (briefComplete || assembleAnyway) && !busy;
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
      const out = await runRecipe({ ...api, shotTags: (a, progress) => loadShotTags(projectId, a, progress) }, { recipe, ratio, values, assets, fps, replaceTimeline: true, onProgress: setBusy });
      setNotes(out.messages);
      if (out.action) {
        onApply(out.action);
        // RS-108: remember the run so chat can re-cut sections or re-pick shots
        await saveRun({ get: kvGet, set: kvSet }, projectId, { ...out.run, brief, briefConfirmedShotRequests: confirmedShotRequests }).catch(() => setNotes((n) => [...n, 'Could not save the recipe run; re-cut from chat will not work.']));
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
      const out = await runRecipe({ ...api, shotTags: (a, progress) => loadShotTags(projectId, a, progress) }, { recipe, ratio, values, assets, fps, replaceTimeline: false, onProgress: setBusy });
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
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12.5 }}>Aspect ratio</span>
          <select aria-label="Recipe aspect ratio" style={input} value={ratio} onChange={(event) => {
            const selected = event.target.value as RatioId;
            if (!ratios.includes(selected)) return;
            setRatio(selected); setPreview(null);
            onApply({ type: 'batch', label: `Set canvas to ${selected}`, actions: [{ type: 'setCanvas', ...RATIO_SIZES[selected], fit: 'cover' }] });
          }}>
            {ratios.map((id) => <option key={id} value={id}>{id} · {RATIO_SIZES[id].width} × {RATIO_SIZES[id].height}</option>)}
          </select>
        </label>

        {brief && briefMapping && <section aria-label="Brief checklist" style={{ display: 'grid', gap: 6, padding: 9, border: `0.5px solid ${theme.border}`, borderRadius: 7 }}>
          <b style={{ fontSize: 12.5 }}>Brief checklist</b>
          {brief.whyTrending && <span style={label}>{brief.whyTrending}</span>}
          {brief.sources?.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" style={{ ...label, color: theme.accent }}>{source.title}{source.publishedAt ? ` · ${source.publishedAt}` : ''}</a>)}
          {briefItems.map((item) => <label key={item.id} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12 }}>
            {item.kind === 'shot'
              ? <input type="checkbox" checked={confirmedShotRequests.includes(item.index!)} onChange={(event) => setConfirmedShotRequests((current) => event.target.checked ? [...new Set([...current, item.index!])] : current.filter((id) => id !== item.index))} />
              : <span aria-label={item.complete ? 'Complete' : 'Incomplete'}>{item.complete ? '✓' : '○'}</span>}
            <span style={{ color: item.complete ? theme.text : theme.textDim }}>{item.label}</span>
          </label>)}
          {briefMapping.text.some(({ request }) => request.count > 1) && <span style={label}>Separate multiple text items with “/”.</span>}
          {briefMapping.warnings.map((warning) => <span key={warning} style={{ ...label, color: theme.gold }}>{warning}</span>)}
          {!briefComplete && <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 11.5, color: theme.textDim }}>
            <input type="checkbox" checked={assembleAnyway} onChange={(event) => setAssembleAnyway(event.target.checked)} /> Assemble anyway
          </label>}
        </section>}

        {mediaInputs(recipe).map((inp) => {
          const pool = assets.filter((a) => inp.accept.includes(a.kind as never));
          const chosen = values.media[inp.id] ?? [];
          const candidates = pool.slice(0, inp.max);
          const allSelected = candidates.length > 0 && candidates.every((a) => chosen.some((m) => m.assetId === a.id));
          return (
            <div key={inp.id} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5 }}>{inp.label} <span style={label}>({inp.min === inp.max ? inp.max : `${inp.min}–${inp.max}`}, {chosen.length} chosen)</span></span>
                {inp.max > 1 && favoriteCount(pool) > 0 && (
                  <button type="button" aria-label={`Use starred ${inp.label}`} title="Use only the items you starred in My Media" style={{ ...input, cursor: 'pointer' }} onClick={() => setValues((v) => ({
                    ...v, media: { ...v.media, [inp.id]: isFavoritesSelected(pool, inp.max, chosen) ? [] : favoritesSelection(pool, inp.max) },
                  }))}>{isFavoritesSelected(pool, inp.max, chosen) ? 'None' : `★ Starred (${favoriteCount(pool)})`}</button>
                )}
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

        {recipe.assembler.strategy === 'beat-montage@1' && (() => {
          const first = mediaInputs(recipe).find((i) => !i.accept.includes('audio'));
          const chosenClips = first ? (values.media[first.id] ?? []).map((m) => assets.find((a) => a.id === m.assetId)).filter((a): a is MediaAsset => !!a) : [];
          if (chosenClips.length < 2) return null;
          const current = chosenClips.some((a) => a.id === values.openerAssetId) ? values.openerAssetId : '';
          return (
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12.5 }}>Start the reel with</span>
              <select aria-label="Opening clip" style={input} value={current} onChange={(e) => setValues((v) => ({ ...v, openerAssetId: e.target.value || undefined }))}>
                <option value="">Best opening (automatic)</option>
                {chosenClips.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <span style={label}>This clip becomes the first shot. The rest are still chosen for you.</span>
            </label>
          );
        })()}

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

        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12.5 }}>Clips that are not {ratio}</span>
          <select style={{ background: theme.inset, color: theme.text, border: `0.5px solid ${theme.border}`, borderRadius: 5, padding: '5px 7px', fontSize: 12.5 }}
            value={mismatchFitOf(values.params)} onChange={(e) => setValues((v) => ({ ...v, params: { ...v.params, [MISMATCH_FIT_PARAM]: e.target.value } }))}>
            <option value="auto">Automatic (crop, but fit small pictures whole)</option>
            <option value="fill">Crop to fill the frame</option>
            <option value="blur">Fit whole over a blurred background</option>
          </select>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
          <input type="checkbox" checked={values.params[ENHANCE_PHOTOS_PARAM] === true}
            onChange={(e) => setValues((v) => ({ ...v, params: { ...v.params, [ENHANCE_PHOTOS_PARAM]: e.target.checked } }))} />
          <span>Enhance small photos (2x, slower; sharper but can invent detail)</span>
        </label>

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

        <button type="button" disabled={!canStartAssembly} onClick={() => { void assemble(); }} style={{
          padding: '9px 12px', borderRadius: 7, border: 'none', fontSize: 13.5, fontWeight: 600,
          cursor: canStartAssembly ? 'pointer' : 'not-allowed',
          background: canStartAssembly ? theme.accent : theme.panelAlt, color: canStartAssembly ? theme.onAccent : theme.textDim,
        }}>{busy || 'Assemble'}</button>
        <button type="button" disabled={!canAssemble(recipe, values, assets) || !!busy} onClick={() => { void previewWithMine(); }}
          style={{ ...input, cursor: canAssemble(recipe, values, assets) && !busy ? 'pointer' : 'not-allowed', justifySelf: 'stretch', padding: '7px 10px' }}>
          Preview with my footage
        </button>
      </fieldset>
      {busy && <p role="status" style={label}>{busy}</p>}
      {preview && (
        <div style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
          <video src={preview.src} muted autoPlay loop playsInline style={{ width: 180, aspectRatio: ratio.replace(':', ' / '), borderRadius: 8, background: '#000' }} />
          <span style={label}>Preview ready in {(preview.ms / 1000).toFixed(1)} s. Nothing was added to the timeline.</span>
        </div>
      )}
      {notes.length > 0 && <ul role="status" style={{ margin: 0, paddingLeft: 16, ...label }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </div>
  );
}
