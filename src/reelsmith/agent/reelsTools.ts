// Executors for the Reelsmith agent tools (schemas in ./reelsToolSchemas.ts).
// Every edit is one commands.batch call, so each tool call is one undo step.
import type { Recipe } from '../../../shared/reelsmith/recipe';
import type { AgentContext } from '../../agent/context';
import type { AtomicAction } from '../../editor/reducerActions';
import type { MediaAsset, TimelineState } from '../../editor/types';
import { resolveTrackId } from '../../editor/types';
import { assemble, type RecipeRunRecord } from '../assembler';
import { validateSelection } from '../assembler/selection';
import { framesAllowed } from '../framePrivacy';
import { candidateFacts, selectionKey, selectionPools, selectionSnapshot } from './selectionContext';
import { lintReel } from '../reelLint';
import { snapTrackToBeats } from '../snapAction';
import { strobeForTimeline } from '../strobeAction';
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

async function rebuild(ctx: AgentContext, deps: ReelsDeps): Promise<{ run: RecipeRunRecord; recipe: Recipe; prepared: Prepared; snapshot: string; selectionKey: string; projectId: string } | { error: string }> {
  const id = projectId(ctx);
  const snapshot = selectionSnapshot(id, ctx.getDoc());
  const run = await loadRun(deps.kv, id);
  if (!run) return { error: 'This timeline was not built by a recipe (no saved run). Use the Recipes tab first.' };
  if (!run.media) return { error: 'The saved run is from an older version and lacks its media list; assemble it again from the Recipes tab.' };
  const recipe = deps.recipes.find((r) => r.id === run.recipeId);
  if (!recipe) return { error: `recipe "${run.recipeId}" is not installed` };
  if (recipe.version !== run.recipeVersion || recipe.assembler.strategy !== run.assembler) return { error: 'The recipe version changed. Assemble it again before choosing shots.' };
  const state = ctx.getState();
  const assets = ctx.getDoc().assets ?? [];
  const prepared = await prepareAssembly(deps.api, {
    recipe, values: valuesFromRun(run, assets), assets: [...assets], fps: state.fps, replaceTimeline: false, seed: run.seed, preferredAssetIds: run.preferredAssetIds, preferredBrollAssetIds: run.preferredBrollAssetIds,
  });
  const key = await selectionKey(snapshot, run);
  if (selectionSnapshot(projectId(ctx), ctx.getDoc()) !== snapshot) return { error: 'The timeline or media changed during analysis. Call reels_selection_candidates again before making picks.' };
  return { run, recipe, prepared, snapshot, selectionKey: key, projectId: id };
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

    case 'reels_strobe': {
      const mode = args.mode === 'closer' ? 'closer' : 'opener';
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
      const out = strobeForTimeline(state, ctx.getDoc().assets ?? [], {
        mode, lengthSec: num(args.lengthSec), flashSec: num(args.flashSec), accent: args.accent === false ? false : undefined,
        seed: (Date.now() % 1_000_000) + 1,
      });
      if (!out.ok) return { error: out.error };
      ctx.commands.batch(out.actions, out.label);
      return { ok: true, mode, shots: out.plan.shots.length, startFrame: out.plan.startFrame, endFrame: out.plan.endFrame, warnings: out.plan.warnings };
    }

    case 'reels_selection_candidates': {
      const built = await rebuild(ctx, deps);
      if ('error' in built) return built;
      if (built.recipe.assembler.aiSelection === 'off') return { error: 'This recipe does not support agent shot selection.' };
      const { input } = built.prepared;
      let heuristic;
      try { heuristic = assemble(input); } catch (error) { return { error: String(error), fallback: 'Keep the existing reel and choose shorter cuts or add footage.' }; }
      if (!heuristic.action) return { error: 'The recipe cannot currently assemble; keep the existing reel.', warnings: heuristic.report.warnings };
      const pool = selectionPools(input, heuristic);
      const allowFrames = framesAllowed(built.projectId);
      return {
        recipe: built.recipe.name,
        selectionKey: built.selectionKey,
        slots: pool.slots,
        brollSlots: pool.brollSlots,
        candidates: pool.primary.map((clip) => candidateFacts(clip, state.fps, allowFrames)),
        brollCandidates: pool.broll.map((clip) => candidateFacts(clip, state.fps, allowFrames)),
        heuristicPick: heuristic.report.usedAssetIds,
        framesAllowed: allowFrames,
        hint: allowFrames
          ? 'Use the inspect requests for small contact sheets of uncertain clips, then propose_selection with this selectionKey. Prefer variety and clear action; never choose two from one groupId.'
          : 'Frame sharing is off. Choose from names, scores, capture times and transcript excerpts; do not request frames. Call propose_selection with this selectionKey.',
      };
    }

    case 'propose_selection': {
      if (typeof args.selectionKey !== 'string') return { error: 'Call reels_selection_candidates first and pass its selectionKey.' };
      const built = await rebuild(ctx, deps);
      if ('error' in built) return built;
      if (built.recipe.assembler.aiSelection === 'off') return { error: 'This recipe does not support agent shot selection.' };
      if (args.selectionKey !== built.selectionKey) return { error: 'These picks are stale because the timeline, media or recipe run changed. Call reels_selection_candidates again. The current timeline was kept.' };
      const { input } = built.prepared;
      let heuristic;
      try { heuristic = assemble(input); } catch (error) { return { error: String(error), fallback: 'The current timeline was kept.' }; }
      if (!heuristic.action) return { error: 'The recipe cannot currently assemble; the current timeline was kept.', warnings: heuristic.report.warnings };
      const pool = selectionPools(input, heuristic);
      const check = validateSelection({ assetIds: args.assetIds }, pool.primary, pool.slots);
      const brollCheck = validateSelection({ assetIds: args.brollAssetIds ?? [] }, pool.broll, pool.brollSlots);
      let result;
      let fallbackReason: string | undefined;
      try {
        result = assemble({ ...input, preferredAssetIds: check.accepted, preferredBrollAssetIds: brollCheck.accepted });
        if (!result.action) { fallbackReason = result.report.warnings.join('; '); result = heuristic; }
      } catch (error) { fallbackReason = error instanceof Error ? error.message : String(error); result = heuristic; }
      if (selectionSnapshot(projectId(ctx), ctx.getDoc()) !== built.snapshot) return { error: 'The timeline changed during selection. Call reels_selection_candidates again. The current timeline was kept.' };
      const accepted = fallbackReason ? [] : check.accepted.filter((id) => result.report.usedAssetIds.includes(id));
      const acceptedBroll = fallbackReason ? [] : brollCheck.accepted.filter((id) => result.report.usedAssetIds.includes(id));
      const rejected = [
        ...check.rejected, ...brollCheck.rejected,
        ...[...check.accepted, ...brollCheck.accepted].filter((id) => !accepted.includes(id) && !acceptedBroll.includes(id))
          .map((value) => ({ value, reason: fallbackReason ?? 'not used by this recipe' })),
      ];
      const warnings = [...result.report.warnings, ...(fallbackReason ? [`Agent picks could not fit: ${fallbackReason}. Kept the automatic selection.`] : [])];
      // With no usable picks the assembled reel is already the fallback; keep manual edits intact.
      if (!accepted.length && !acceptedBroll.length) return {
        ok: true, accepted: 0, acceptedAssetIds: [], acceptedBrollAssetIds: [], rejected,
        filledByHeuristic: heuristic.report.usedAssetIds.length, shots: heuristic.report.shots, keptExisting: true, warnings,
      };
      const runTag = `${built.recipe.id}@${built.recipe.version}`;
      const baselineIds = new Set(heuristic.action.actions.flatMap((action) => action.type === 'add' ? [action.item.id] : []));
      const removes: AtomicAction[] = ctx.getState().items
        .filter((item) => isRecipeItem(item.id) && (item.props?.rsRun === runTag || baselineIds.has(item.id)))
        .map((item) => ({ type: 'remove', id: item.id }));
      commit(ctx, [...removes, ...withBeatGrid(result.action!.actions, input.music)], `${built.recipe.name}: agent's shot choice`);
      const rationale = typeof args.rationale === 'string' ? args.rationale.trim().slice(0, 500) : '';
      try {
        await saveRun(deps.kv, built.projectId, {
          ...runRecord(result, validateValues(built.run)), preferredAssetIds: accepted,
          preferredBrollAssetIds: acceptedBroll, selectionRationale: rationale,
        });
      } catch { warnings.push('The timeline was updated, but the shot choice could not be saved.'); }
      return {
        ok: true, accepted: accepted.length + acceptedBroll.length, acceptedAssetIds: accepted, acceptedBrollAssetIds: acceptedBroll,
        rejected, filledByHeuristic: result.report.usedAssetIds.filter((id) => !accepted.includes(id) && !acceptedBroll.includes(id)).length,
        shots: result.report.shots, rationale, warnings,
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
