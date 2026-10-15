// Executors for the Reelsmith agent tools (schemas in ./reelsToolSchemas.ts).
// Every edit is one commands.batch call, so each tool call is one undo step.
import type { Recipe } from '../../../shared/reelsmith/recipe';
import type { AgentContext } from '../../agent/context';
import type { AtomicAction } from '../../editor/reducerActions';
import type { MediaAsset, TimelineState } from '../../editor/types';
import { resolveTrackId } from '../../editor/types';
import { assemble, type RecipeRunRecord } from '../assembler';
import { validateSelection } from '../assembler/selection';
import { lintReel } from '../reelLint';
import { snapTrackToBeats } from '../snapAction';
import { prepareAssembly, runRecord, withBeatGrid, type AnalyzeApi, type Prepared } from '../runRecipe';
import { loadRun, recutSection, saveRun, type Kv } from '../runStore';
import type { SetupValues } from '../setupForm';
import { bindTracks } from '../trackBinding';
export { REELS_TOOL_NAMES, REELS_TOOL_SCHEMAS } from './reelsToolSchemas';

type Args = Record<string, unknown>;

export interface ReelsDeps {
  api: AnalyzeApi;
  kv: Kv;
  recipes: Recipe[];
}

/** Items a recipe made carry ids starting with "rs-" (stableId in assembler/rng.ts). */
export const isRecipeItem = (id: string) => /^rs-/.test(id);

function projectId(ctx: AgentContext): string {
  return ctx.getProjectId?.() ?? 'current';
}

function valuesFromRun(run: RecipeRunRecord, assets: readonly MediaAsset[]): SetupValues {
  const kindOf = (id: string) => (assets.find((a) => a.id === id)?.kind ?? 'video') as 'video' | 'image' | 'audio';
  const media = Object.fromEntries(Object.entries(run.media ?? {}).map(([k, ids]) => [k, ids.filter((id) => assets.some((a) => a.id === id)).map((assetId) => ({ assetId, kind: kindOf(assetId) }))]));
  return { media, texts: run.texts, params: run.params, agentPick: 'off' };
}

async function rebuild(ctx: AgentContext, deps: ReelsDeps): Promise<{ run: RecipeRunRecord; recipe: Recipe; prepared: Prepared } | { error: string }> {
  const run = await loadRun(deps.kv, projectId(ctx));
  if (!run) return { error: 'This timeline was not built by a recipe (no saved run). Use the Recipes tab first.' };
  if (!run.media) return { error: 'The saved run is from an older version and lacks its media list; assemble it again from the Recipes tab.' };
  const recipe = deps.recipes.find((r) => r.id === run.recipeId);
  if (!recipe) return { error: `recipe "${run.recipeId}" is not installed` };
  const state = ctx.getState();
  const assets = ctx.getDoc().assets ?? [];
  const prepared = await prepareAssembly(deps.api, {
    recipe, values: valuesFromRun(run, assets), assets: [...assets], fps: state.fps, replaceTimeline: false, seed: run.seed,
  });
  return { run, recipe, prepared };
}

function sections(state: TimelineState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of state.items) {
    const s = (i.props as { rsSection?: string } | undefined)?.rsSection;
    if (s && i.kind !== 'solid' && i.kind !== 'text') out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

function commit(ctx: AgentContext, actions: AtomicAction[], label: string) {
  const bound = bindTracks({ type: 'batch', label, actions }, ctx.getState());
  ctx.commands.batch(bound.actions, bound.label);
}

export async function execReelsTool(name: string, args: Args, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const state = ctx.getState();
  switch (name) {
    case 'reels_lint':
      return lintReel(state);

    case 'reels_run_info': {
      const run = await loadRun(deps.kv, projectId(ctx));
      return { run, sections: sections(state) };
    }

    case 'reels_recut_section': {
      const section = typeof args.section === 'string' ? args.section.trim() : '';
      if (!section) return { error: 'section is required' };
      const present = sections(state);
      if (!present[section]) return { error: `no clips of section "${section}" on the timeline; sections: ${Object.keys(present).join(', ') || 'none'}` };
      const built = await rebuild(ctx, deps);
      if ('error' in built) return built;
      const seed = typeof args.seed === 'number' && Number.isFinite(args.seed) ? Math.round(args.seed) : (Date.now() % 1_000_000) + 1;
      const batch = recutSection(state.items, built.prepared.input, section, seed);
      if (!batch) return { error: `could not re-cut "${section}" (not enough unused clips?)`, warnings: built.prepared.messages };
      commit(ctx, batch.actions, batch.label ?? `Re-cut ${section}`);
      return { ok: true, section, seed, removed: present[section], added: batch.actions.filter((a) => a.type === 'add').length, notes: built.prepared.messages };
    }

    case 'reels_snap_cuts_to_beats': {
      const every: 1 | 2 | 4 = args.every === 2 || args.every === 4 ? args.every : 1;
      const track = resolveTrackId(state, typeof args.track === 'string' ? args.track : 'V1', 'video');
      if (!track) return { error: `video track "${String(args.track ?? 'V1')}" not found` };
      const maxShift = typeof args.maxShiftSec === 'number' && args.maxShiftSec > 0 ? Math.round(args.maxShiftSec * state.fps) : undefined;
      const out = await snapTrackToBeats(state, ctx.getDoc().assets ?? [], track, every, deps.api, { maxShiftFrames: maxShift, onProgress: ctx.onToolProgress });
      if (!out.ok) return { error: out.error };
      if (out.actions.length) ctx.commands.batch(out.actions, out.label);
      return { ok: true, every, moved: out.moved, unchanged: out.unchanged, skipped: out.skipped };
    }

    case 'reels_selection_candidates': {
      const built = await rebuild(ctx, deps);
      if ('error' in built) return built;
      const { input } = built.prepared;
      const heuristic = assemble(input);
      const fps = state.fps;
      return {
        recipe: built.recipe.name,
        slots: heuristic.report.shots,
        candidates: input.clips.map((c) => ({
          assetId: c.assetId, name: c.name, seconds: +(c.durationInFrames / fps).toFixed(1), score: +c.score.toFixed(2),
          ...(c.groupId ? { groupId: c.groupId } : {}),
          ...(c.bestStartFrame !== undefined ? { bestStartSec: +(c.bestStartFrame / fps).toFixed(1) } : {}),
          ...(c.captureTimeMs ? { captured: new Date(c.captureTimeMs).toISOString() } : {}),
        })),
        heuristicPick: heuristic.report.usedAssetIds,
        hint: 'Prefer variety, faces and clear action; avoid two clips from the same groupId. Answer with propose_selection.',
      };
    }

    case 'propose_selection': {
      const built = await rebuild(ctx, deps);
      if ('error' in built) return built;
      const { input } = built.prepared;
      const slots = assemble(input).report.shots;
      const check = validateSelection({ assetIds: args.assetIds, rationale: args.rationale }, input.clips, slots);
      const result = assemble({ ...input, preferredAssetIds: check.accepted });
      if (!result.action) return { error: 'the recipe could not assemble with these picks', rejected: check.rejected, warnings: result.report.warnings };
      const removes: AtomicAction[] = state.items.filter((i) => isRecipeItem(i.id)).map((i) => ({ type: 'remove', id: i.id }));
      commit(ctx, [...removes, ...withBeatGrid(result.action.actions, input.music)], `${built.recipe.name}: agent's shot choice`);
      const pick = validateValues(built.run);
      await saveRun(deps.kv, projectId(ctx), { ...runRecord(result, pick), preferredAssetIds: check.accepted } as RecipeRunRecord);
      const filled = result.report.usedAssetIds.filter((id) => !check.accepted.includes(id)).length;
      return {
        ok: true, accepted: check.accepted.length, rejected: check.rejected, filledByHeuristic: filled, shots: result.report.shots,
        warnings: result.report.warnings,
      };
    }
  }
  return { error: `unknown tool ${name}` };
}

/** SetupValues carrying only the media map, for runRecord. */
function validateValues(run: RecipeRunRecord): SetupValues {
  return {
    media: Object.fromEntries(Object.entries(run.media ?? {}).map(([k, ids]) => [k, ids.map((assetId) => ({ assetId, kind: 'video' as const }))])),
    texts: run.texts, params: run.params, agentPick: 'off',
  };
}
