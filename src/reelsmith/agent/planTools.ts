// "Plan a reel": the agent reads the recipes and the imported media in one call, then builds the reel from a plan in one more.
import { supportedRatios, type Recipe, type RecipeMediaInput } from '../../../shared/reelsmith/recipe';
import { isRatioId } from '../../../shared/reelsmith/ratios';
import type { AgentContext } from '../../agent/context';
import type { MediaAsset } from '../../editor/types';
import { runRecipe } from '../runRecipe';
import { SIGNATURES } from '../signatures';
import { saveRun } from '../runStore';
import { defaultValues, mediaInputs, type SetupValues } from '../setupForm';
import { checkTexts, commit, projectId, type ReelsDeps } from './reelsTools';

const MAX_ASSETS = 150;
const PLANNABLE = new Set(['video', 'image', 'audio']);

const secs = (asset: MediaAsset, fps: number) => Math.round((asset.durationInFrames / fps) * 10) / 10;

const MAX_BEAT_CHECKS = 3;
const BEAT_STRATEGIES = new Set(['beat-montage@1', 'travel-diary@1']);
const needsBeat = (r: Recipe) => BEAT_STRATEGIES.has(r.assembler.strategy);

/** Whether a song has a steady beat; 'unknown' when the check fails, so a flaky analysis never blocks a plan. */
async function beatOf(asset: MediaAsset, deps: ReelsDeps): Promise<'steady' | 'none' | 'unknown'> {
  try {
    const grid = await deps.api.musicGrid(asset);
    return grid && grid.beatTimesSec.length >= 2 ? 'steady' : 'none';
  } catch { return 'unknown'; }
}

export async function planOptions(ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const fps = ctx.getState().fps;
  const all = (ctx.getDoc().assets ?? []).filter((a) => PLANNABLE.has(a.kind));
  const shown = all.slice(0, MAX_ASSETS);
  const songs = shown.filter((a) => a.kind === 'audio').slice(0, MAX_BEAT_CHECKS);
  const beats = new Map(await Promise.all(songs.map(async (a) => [a.id, await beatOf(a, deps)] as const)));
  return {
    assets: shown.map((a) => ({
      assetId: a.id, name: a.name, kind: a.kind, seconds: secs(a, fps),
      ...(beats.has(a.id) ? { beat: beats.get(a.id) } : {}),
      ...(a.width && a.height ? { size: `${a.width}x${a.height}`, orientation: a.height > a.width ? 'portrait' : a.height < a.width ? 'landscape' : 'square' } : {}),
    })),
    ...(all.length > MAX_ASSETS ? { assetsTruncated: all.length - MAX_ASSETS } : {}),
    timelineIsEmpty: ctx.getState().items.length === 0,
    signatures: SIGNATURES.map((g) => ({ id: g.id, name: g.name, mood: g.mood, bestRecipes: g.recipes })),
    recipes: deps.recipes.map((r) => ({
      id: r.id, name: r.name, category: r.category, description: r.description,
      ratios: supportedRatios(r), targetSec: r.duration?.targetSec, music: r.music?.required ? 'required' : 'optional', needsBeat: needsBeat(r), lengthFixed: r.assembler.strategy === 'travel-diary@1',
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

/** Builds with `recipeId`; when that fails only because the song has no steady beat, builds `fallbackRecipeId` instead in the same call. */
export async function planAssemble(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const first = await assembleOne(args, ctx, deps) as { error?: string };
  if (!first.error || !/steady beat/.test(first.error)) return first;
  const fallback = typeof args.fallbackRecipeId === 'string' ? deps.recipes.find((r) => r.id === args.fallbackRecipeId) : undefined;
  if (fallback && !needsBeat(fallback)) {
    const second = await assembleOne({ ...args, recipeId: fallback.id }, ctx, deps) as Record<string, unknown>;
    return second.ok ? { ...second, fellBackFrom: args.recipeId, why: 'the song has no steady beat' } : second;
  }
  const free = deps.recipes.filter((r) => !needsBeat(r)).map((r) => r.id);
  return { error: `${first.error}. Pick a recipe that needs no beat (${free.join(', ')}), or import a song with a clear beat; pass fallbackRecipeId to do this in one call.` };
}

async function assembleOne(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const base = deps.recipes.find((r) => r.id === args.recipeId);
  const wantSec = typeof args.targetSec === 'number' && Number.isFinite(args.targetSec) && args.targetSec > 0 ? args.targetSec : undefined;
  const d = base?.duration;
  // the user's length, kept inside the recipe's own limits; recipes with a fixed slot plan ignore it and report their real length
  const recipe = base && d && wantSec !== undefined ? { ...base, duration: { ...d, targetSec: Math.min(d.maxSec ?? wantSec, Math.max(d.minSec ?? 0, wantSec)) } } : base;
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
  const seconds = Math.round((out.result.report.totalFrames / state.fps) * 10) / 10;
  const shots = out.result.report.shots;
  const fixed = base?.assembler.strategy === 'travel-diary@1';
  commit(ctx, out.action.actions, out.action.label ?? `Plan: ${recipe.name}`);
  let saved = true;
  try { await saveRun(deps.kv, projectId(ctx), out.run); } catch { saved = false; }
  return {
    ok: true, recipe: recipe.name, ratio: ratio ?? supportedRatios(recipe)[0], shots: out.result.report.shots,
    seconds, ...(wantSec !== undefined && Math.abs(seconds - wantSec) > 1.5 ? { lengthNote: `The reel is ${seconds} s, not the ${wantSec} s asked for${fixed ? ': this recipe has a fixed slot plan whose length follows the song tempo' : ''}. Use a recipe without lengthFixed, or tell the user.${shots > 0 && seconds > 0 && !fixed ? ` Shots here run about ${Math.round((seconds / shots) * 10) / 10} s, so name about ${Math.max(3, Math.round(wantSec / (seconds / shots)))} of the best clips or photos in media (or change the cut rule) to land on ${wantSec} s.` : ''}` } : {}),
    usedAssetIds: out.result.report.usedAssetIds, texts: values.texts, notes: out.messages, ...(rejected.length ? { rejected } : {}),
    ...(saved ? {} : { warning: 'The reel was built, but the recipe run could not be saved; re-cut from chat will not work.' }),
    next: 'Run reels_lint, then tell the user what you built in two or three plain lines.',
  };
}
