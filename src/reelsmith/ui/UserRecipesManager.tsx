// "Your recipes" in the Recipes tab: recipes drafted by the agent (pasted JSON) or saved from a directed reel, with
// edit, duplicate, delete, share as a file and import a shared file. All of them are validated before they are saved.
import { useEffect, useRef, useState } from 'react';
import { parseRecipe, type Recipe } from '../../../shared/reelsmith/recipe';
import { theme } from '../../theme';
import { bundledCatalog } from '../bundledRecipes';
import { deleteUserRecipe, listUserRecipes, saveUserRecipe } from '../userRecipesApi';
import { importRecipeFile, recipeShareFile, SHARE_EXT } from '../reelRecipeActions';

const AI_RECIPE_PROMPT = [
  'Draft one new Reelsmith recipe manifest as JSON only. Use schemaVersion 1, an id beginning with "ai-", a supported category, 9:16 canvas, declared inputs and params, existing assembler strategy only (beat-montage@1, story-vlog@1, captioned-story@1, collage-grid@1, or travel-diary@1), valid structure/styles, and no executable code or external file paths.',
  'Keep it practical for ordinary imported clips. Use only existing layout, transition, overlay and animation values from the bundled recipes. Include a concise name, description, required media and optional text inputs. I will validate the JSON before saving it.',
].join(' ');

const label: React.CSSProperties = { fontSize: 11.5, color: theme.textDim };
const input: React.CSSProperties = {
  background: theme.inset, color: theme.text, border: `0.5px solid ${theme.border}`, borderRadius: 5, padding: '5px 7px', fontSize: 12.5,
};

export const addRecipeTo = (saved: Recipe) => (current: Recipe[]) => [...current.filter((entry) => entry.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name));

export function UserRecipesManager({ userRecipes, setUserRecipes, busy, setBusy, onAskAgent }: {
  userRecipes: Recipe[];
  setUserRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onAskAgent?: (text: string, opts?: { autoSend?: boolean }) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managerError, setManagerError] = useState('');
  const importInput = useRef<HTMLInputElement>(null);
  const addUserRecipe = (saved: Recipe) => setUserRecipes(addRecipeTo(saved));
  const shareRecipe = async (entry: Recipe) => {
    setManagerError('');
    try {
      const { name, blob } = await recipeShareFile(entry);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) { setManagerError(error instanceof Error ? error.message : String(error)); }
  };
  const importRecipe = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setManagerError('');
    try { addUserRecipe(await importRecipeFile(await file.text())); }
    catch (error) { setManagerError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); if (importInput.current) importInput.current.value = ''; }
  };
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
    const allIds = new Set([...bundledCatalog.recipes, ...userRecipes].map((entry) => entry.id));
    const slug = parsed.recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'recipe';
    const id = editingId ?? `ai-${slug}-${crypto.randomUUID().slice(0, 8)}`;
    if (!editingId && allIds.has(id)) { setManagerError('A recipe with this id already exists. Try saving again.'); return; }
    const candidate = { ...parsed.recipe, id };
    const normalized = parseRecipe(JSON.stringify(candidate));
    if (!normalized.ok) { setManagerError(normalized.errors.join('; ')); return; }
    setBusy(true);
    try {
      const saved = await saveUserRecipe(normalized.recipe, !!editingId);
      addUserRecipe(saved);
      setDraft(''); setEditingId(null);
    } catch (error) { setManagerError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const duplicate = async (source: Recipe) => {
    const slug = source.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'recipe';
    const copy = { ...source, id: `ai-${slug}-copy-${crypto.randomUUID().slice(0, 6)}`, name: `${source.name.slice(0, 54)} copy` };
    setBusy(true); setManagerError('');
    try {
      const saved = await saveUserRecipe(copy);
      addUserRecipe(saved);
    } catch (error) { setManagerError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const removeUserRecipe = async (entry: Recipe) => {
    if (!window.confirm(`Delete the recipe “${entry.name}”?`)) return;
    setBusy(true); setManagerError('');
    try {
      await deleteUserRecipe(entry.id);
      setUserRecipes((current) => current.filter((candidate) => candidate.id !== entry.id));
    } catch (error) { setManagerError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return (
        <section aria-label="AI-made recipes" style={{ display: 'grid', gap: 8, padding: 10, border: `0.5px solid ${theme.border}`, borderRadius: 8 }}>
          <b style={{ fontSize: 13 }}>Your recipes</b>
          <span style={label}>Paste recipe JSON drafted by your agent. It is validated before it is saved locally, outside the bundled recipes.</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {onAskAgent && <button type="button" disabled={busy} onClick={() => onAskAgent(AI_RECIPE_PROMPT)} style={{ ...input, cursor: 'pointer' }}>Ask agent to draft a recipe</button>}
            <button type="button" disabled={busy} title={`Add a recipe someone shared with you (${SHARE_EXT})`} onClick={() => importInput.current?.click()} style={{ ...input, cursor: 'pointer' }}>Import recipe file</button>
            <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={(e) => { void importRecipe(e.target.files?.[0]); }} />
          </div>
          {userRecipes.map((entry) => <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 100, fontSize: 12 }}>{entry.name}</span>
            <button type="button" disabled={busy} style={{ ...input, cursor: 'pointer' }} onClick={() => { setEditingId(entry.id); setDraft(JSON.stringify(entry, null, 2)); }}>Edit</button>
            <button type="button" disabled={busy} style={{ ...input, cursor: 'pointer' }} onClick={() => { void duplicate(entry); }}>Duplicate</button>
            <button type="button" disabled={busy} title="Save the recipe (and its poster) as one file to send to someone" style={{ ...input, cursor: 'pointer' }} onClick={() => { void shareRecipe(entry); }}>Share file</button>
            <button type="button" disabled={busy} style={{ ...input, cursor: 'pointer' }} onClick={() => { void removeUserRecipe(entry); }}>Delete</button>
          </div>)}
          <textarea aria-label="AI-made recipe JSON" value={draft} onChange={(event) => setDraft(event.target.value)} rows={10} spellCheck={false}
            placeholder="Paste a recipe JSON object from your agent…" style={{ ...input, resize: 'vertical', fontFamily: 'monospace', fontSize: 11.5 }} />
          <div style={{ display: 'flex', gap: 7 }}>
            <button type="button" disabled={busy || !draft.trim()} onClick={() => { void saveDraft(); }} style={{ ...input, cursor: 'pointer' }}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Validate and save'}</button>
            {editingId && <button type="button" disabled={busy} onClick={() => { setEditingId(null); setDraft(''); }} style={{ ...input, cursor: 'pointer' }}>Cancel</button>}
          </div>
          {managerError && <span role="alert" style={{ ...label, color: theme.danger }}>{managerError}</span>}
        </section>
  );
}
