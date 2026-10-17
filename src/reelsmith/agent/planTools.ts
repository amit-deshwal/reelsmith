// "Plan a reel": the agent reads the recipes and the imported media in one call, then builds the reel from a plan in one more.
import { supportedRatios, type Recipe, type RecipeMediaInput } from '../../../shared/reelsmith/recipe';
import { isRatioId } from '../../../shared/reelsmith/ratios';
import type { AgentContext } from '../../agent/context';
import type { MediaAsset } from '../../editor/types';
import { runRecipe } from '../runRecipe';
import { saveRun } from '../runStore';
import { defaultValues, mediaInputs, type SetupValues } from '../setupForm';
import { checkTexts, commit, projectId, type ReelsDeps } from './reelsTools';

const MAX_ASSETS = 150;
const PLANNABLE = new Set(['video', 'image', 'audio']);

const secs = (asset: MediaAsset, fps: number) => Math.round((asset.durationInFrames / fps) * 10) / 10;

export function planOptions(ctx: AgentContext, deps: ReelsDeps): unknown {
  const fps = ctx.getState().fps;
  const all = (ctx.getDoc().assets ?? []).filter((a) => PLANNABLE.has(a.kind));
  return {
    assets: all.slice(0, MAX_ASSETS).map((a) => ({
      assetId: a.id, name: a.name, kind: a.kind, seconds: secs(a, fps),
      ...(a.width && a.height ? { size: `${a.width}x${a.height}`, orientation: a.height > a.width ? 'portrait' : a.height < a.width ? 'landscape' : 'square' } : {}),
    })),
    ...(all.length > MAX_ASSETS ? { assetsTruncated: all.length - MAX_ASSETS } : {}),
    timelineIsEmpty: ctx.getState().items.length === 0,
    recipes: deps.recipes.map((r) => ({
      id: r.id, name: r.name, category: r.category, description: r.description,
      ratios: supportedRatios(r), targetSec: r.duration?.targetSec, music: r.music?.required ? 'required' : 'optional',
      inputs: r.inputs.map((i) => i.kind === 'media'
        ? { id: i.id, kind: 'media', accept: i.accept, min: i.min, max: i.max, label: i.label, ...(i.hint ? { hint: i.hint } : {}), ...(i.constraints?.requiresSpeech ? { needsSpeech: true } : {}) }
        : { id: i.id, kind: 'text', label: i.label, optional: !!i.optional, ...(i.maxLength ? { maxLength: i.maxLength } : {}), ...(i.placeholder ? { example: i.placeholder } : {}) }),
      params: r.params.map((p) => ({ id: p.id, type: p.type, label: p.label, default: p.default, ...(p.options ? { options: p.options } : {}), ...(p.min !== undefined ? { min: p.min } : {}), ...(p.max !== undefined ? { max: p.max } : {}) })),
      ...(r.agentHints ? { hints: r.agentHints } : {}),
    })),
  };
}

/** Media per input: what the plan names, else every unused asset the input accepts (clips) or the only song (audio). */
function pickMedia(recipe: Recipe, raw: unknown, assets: readonly MediaAsset[]): { media: SetupValues['media']; problems: string[] } {
  const problems: string[] = [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  const named = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  for (const key of Object.keys(named)) if (!recipe.inputs.some((i) => i.id === key && i.kind === 'media')) problems.push(`"${key}" is not a media input of ${recipe.name}`);
  const used = new Set<string>();
  const media: SetupValues['media'] = {};
  const fill = (input: RecipeMediaInput) => {
    const ids = Array.isArray(named[input.id]) ? (named[input.id] as unknown[]).filter((v): v is string => typeof v === 'string') : null;
    if (ids) {
      for (const id of ids) if (!byId.has(id)) problems.push(`${input.id}: unknown assetId ${id}`);
      return ids.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
    }
    const free = assets.filter((a) => !used.has(a.id) && input.accept.includes(a.kind as 'video' | 'image' | 'audio'));
    return input.accept.includes('audio') && !input.accept.includes('video') ? (free.length === 1 ? free : []) : free.slice(0, input.max);
  };
  // named inputs first, so a default fill never takes a clip the plan assigned elsewhere
  const order = [...mediaInputs(recipe)].sort((a, b) => Number(Array.isArray(named[b.id])) - Number(Array.isArray(named[a.id])));
  for (const input of order) {
    const picked = fill(input);
    picked.forEach((a) => used.add(a.id));
    media[input.id] = picked.map((a) => ({ assetId: a.id, kind: a.kind as 'video' | 'image' | 'audio' }));
  }
  return { media, problems };
}

export async function planAssemble(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const recipe = deps.recipes.find((r) => r.id === args.recipeId);
  if (!recipe) return { error: `unknown recipeId ${JSON.stringify(args.recipeId)}; use one of: ${deps.recipes.map((r) => r.id).join(', ')}` };
  const ratio = typeof args.ratio === 'string' ? args.ratio : undefined;
  if (ratio !== undefined && (!isRatioId(ratio) || !supportedRatios(recipe).includes(ratio))) return { error: `${recipe.name} supports ${supportedRatios(recipe).join(', ')}, not ${ratio}` };
  const state = ctx.getState();
  if (state.items.length > 0 && args.replaceTimeline !== true) return { error: 'The timeline already has items and building replaces it. Ask the user, then call again with replaceTimeline true (one undo step restores it).' };

  const assets = [...(ctx.getDoc().assets ?? [])];
  const values = defaultValues(recipe);
  const { media, problems } = pickMedia(recipe, args.media, assets);
  values.media = media;
  const textCheck = checkTexts(args.texts, recipe);
  Object.assign(values.texts, textCheck.texts);
  const rejected: Array<{ value: unknown; reason: string }> = [...textCheck.rejected];
  if (args.params && typeof args.params === 'object' && !Array.isArray(args.params)) {
    for (const [id, value] of Object.entries(args.params as Record<string, unknown>)) {
      if (!recipe.params.some((p) => p.id === id)) { rejected.push({ value: id, reason: 'not a param of this recipe' }); continue; }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') values.params[id] = value;
      else rejected.push({ value: id, reason: 'param must be a string, number or boolean' });
    }
  }
  if (problems.length) return { error: problems.join('; ') };

  let out;
  try {
    out = await runRecipe({ ...deps.api, ...(deps.shotTags ? { shotTags: deps.shotTags(projectId(ctx)) } : {}) }, {
      recipe, ...(ratio && isRatioId(ratio) ? { ratio } : {}), values, assets, fps: state.fps, replaceTimeline: true,
      ...(typeof args.seed === 'number' && Number.isFinite(args.seed) ? { seed: Math.round(args.seed) } : {}),
      onProgress: ctx.onToolProgress,
    });
  } catch (error) { return { error: error instanceof Error ? error.message : String(error), media: Object.fromEntries(Object.entries(media).map(([k, v]) => [k, v.length])) }; }
  if (!out.action) return { error: `could not assemble: ${out.messages.join('; ') || 'not enough usable footage'}` };
  commit(ctx, out.action.actions, out.action.label ?? `Plan: ${recipe.name}`);
  let saved = true;
  try { await saveRun(deps.kv, projectId(ctx), out.run); } catch { saved = false; }
  return {
    ok: true, recipe: recipe.name, ratio: ratio ?? supportedRatios(recipe)[0], shots: out.result.report.shots,
    usedAssetIds: out.result.report.usedAssetIds, texts: values.texts, notes: out.messages, ...(rejected.length ? { rejected } : {}),
    ...(saved ? {} : { warning: 'The reel was built, but the recipe run could not be saved; re-cut from chat will not work.' }),
    next: 'Run reels_lint, then tell the user what you built in two or three plain lines.',
  };
}
