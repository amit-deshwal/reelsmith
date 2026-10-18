// Ideas panel routes: suggest recipes for a described reel, or draft a new recipe when none fits.
// Both run the user's own `claude` CLI once, with no tools (claudeOnce.ts).
import type { Connect } from 'vite';
import { IDEA_ANSWER_SCHEMA, ideaPrompt, parseIdeaAnswer, rankIdeasOffline, type IdeaRequest } from '../../shared/reelsmith/ideaMatch.ts';
import { parseRecipe, validateRecipe, type Recipe } from '../../shared/reelsmith/recipe.ts';
import { readJsonBody, sendJson } from '../plugins/export-http.ts';
import { ClaudeUnavailableError, claudeOnce } from './claudeOnce.ts';
import { listUserRecipes, saveUserRecipe } from './user-recipes.ts';

const DRAFT_SCHEMA = { type: 'object', additionalProperties: false, required: ['recipeJson'], properties: { recipeJson: { type: 'string' } } } as const;

/** Reads {description, vibes, clips, recipes} from the request; recipes are re-validated, never trusted. */
export function readIdeaRequest(body: unknown): { request: IdeaRequest; recipes: Recipe[] } {
  const value = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const description = typeof value.description === 'string' ? value.description.slice(0, 600) : '';
  const vibes = Array.isArray(value.vibes) ? value.vibes.filter((v): v is string => typeof v === 'string').slice(0, 10) : [];
  const clips = typeof value.clips === 'number' && Number.isFinite(value.clips) ? Math.max(1, Math.min(200, Math.round(value.clips))) : undefined;
  const recipes = (Array.isArray(value.recipes) ? value.recipes.slice(0, 200) : [])
    .map((raw) => validateRecipe(raw)).flatMap((result) => result.ok ? [result.recipe] : []);
  if (!description.trim() && !vibes.length) throw new Error('describe the reel or pick a mood');
  if (!recipes.length) throw new Error('no recipes to choose from');
  return { request: { description, vibes, clips }, recipes };
}

/** Words the bundled recipes already use, so a drafted recipe stays inside what the assembler can render. */
function vocabulary(recipes: readonly Recipe[]): string {
  const uniq = (values: Array<string | undefined>) => [...new Set(values.filter((v): v is string => !!v))].sort().join(', ');
  const sections = recipes.flatMap((r) => r.structure);
  const overlays = sections.flatMap((s) => s.overlays ?? []);
  return [
    `assembler strategies: ${uniq(recipes.map((r) => r.assembler.strategy))}`,
    `effect assetIds: ${uniq([...recipes.flatMap((r) => r.look?.effects ?? []), ...sections.flatMap((s) => s.effects ?? [])].map((e) => e.assetId))}`,
    `colorLook: ${uniq(recipes.map((r) => r.look?.colorLook))}`,
    `transitions: ${uniq(sections.map((s) => s.transition))}`,
    `layouts: ${uniq(sections.map((s) => s.layout))}`,
    `overlay positions: ${uniq(overlays.map((o) => o.position))}`,
    `overlay animationIn: ${uniq(overlays.map((o) => o.animationIn))}`,
  ].join('\n');
}

export function draftRecipePrompt(request: IdeaRequest, recipes: readonly Recipe[], examples: readonly Recipe[], errors: string[] = []): string {
  return [
    'Write one new Reelsmith recipe manifest for an Instagram Reel. A recipe is declarative JSON: the app assembles the reel from the user\'s clips and song using it.',
    `What the user wants: ${JSON.stringify(request.description.trim())}${request.vibes.length ? ` (moods: ${request.vibes.join(', ')})` : ''}`,
    'Copy the shape of these working recipes exactly (same keys, same kinds of values). Change the name, description, tags, look, effects, transitions, structure, styles and text to fit the request:',
    ...examples.map((example) => JSON.stringify({ ...example, agentHints: undefined, preview: undefined })),
    `Use only values from this list for those fields:\n${vocabulary(recipes)}`,
    'Rules: schemaVersion 1, id "ai-draft", version "1.0.0", canvas 1080x1920 at 30 fps, no "preview", no "agentHints". Templates only {{inputs.X}} or {{params.X}} that exist. Fonts only ones used by the examples. Keep it practical for ordinary phone clips.',
    errors.length ? `Your previous draft failed validation. Fix these errors:\n${errors.slice(0, 15).join('\n')}` : '',
    'Return the whole recipe as a JSON string in recipeJson.',
  ].filter(Boolean).join('\n\n');
}

async function draftRecipe(request: IdeaRequest, recipes: Recipe[]): Promise<Recipe> {
  const examples = rankIdeasOffline(request, recipes, 2).picks.map((pick) => recipes.find((r) => r.id === pick.recipeId)!);
  let errors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const output = await claudeOnce(draftRecipePrompt(request, recipes, examples, errors), DRAFT_SCHEMA, { model: 'sonnet', effort: 'medium', timeoutMs: 180_000 });
    const text = (output as { recipeJson?: unknown })?.recipeJson;
    const slug = request.description.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'idea';
    const id = `ai-${slug}-${crypto.randomUUID().slice(0, 6)}`;
    let data: unknown;
    try { data = JSON.parse(typeof text === 'string' ? text : ''); } catch (error) { errors = [`invalid JSON: ${(error as Error).message}`]; continue; }
    if (data && typeof data === 'object') {
      const { agentHints: _hints, preview: _preview, ...rest } = data as Record<string, unknown>;
      data = { ...rest, id };
    }
    const parsed = parseRecipe(JSON.stringify(data));
    if (parsed.ok) return saveUserRecipe(parsed.recipe);
    errors = parsed.errors;
  }
  throw new Error(`The drafted recipe did not validate: ${errors.slice(0, 3).join('; ')}`);
}

export function mountIdeaRoutes(middlewares: Connect.Server): void {
  middlewares.use('/api/reelsmith/ideas', async (req, res) => {
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'use POST' }); return; }
    const route = (req.url ?? '').split('?')[0];
    let input: ReturnType<typeof readIdeaRequest>;
    try { input = readIdeaRequest(await readJsonBody(req)); }
    catch (error) { sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) }); return; }
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    try {
      if (route === '/draft-recipe') {
        const all = [...input.recipes, ...(await listUserRecipes()).recipes.filter((r) => !input.recipes.some((x) => x.id === r.id))];
        sendJson(res, 200, { recipe: await draftRecipe(input.request, all) });
        return;
      }
      const output = await claudeOnce(ideaPrompt(input.request, input.recipes), IDEA_ANSWER_SCHEMA, { model: 'sonnet', effort: 'low', signal: abort.signal });
      const answer = parseIdeaAnswer(output, input.recipes);
      if (!answer) throw new Error('Claude returned no usable picks');
      sendJson(res, 200, answer);
    } catch (error) {
      const status = error instanceof ClaudeUnavailableError ? 503 : 502;
      sendJson(res, status, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}
