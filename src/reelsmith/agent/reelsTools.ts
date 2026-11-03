// Executors for the Reelsmith agent tools (schemas in ./reelsToolSchemas.ts).
// Every edit is one commands.batch call, so each tool call is one undo step.
import type { AgentContext } from '../../agent/context';
import type { AtomicAction } from '../../editor/reducerActions';
import type { MediaAsset } from '../../editor/types';
import { resolveTrackId } from '../../editor/types';
import { lintReel } from '../reelLint';
import { snapTrackToBeats } from '../snapAction';
import { strobeForTimeline } from '../strobeAction';
import type { AnalyzeApi } from '../runRecipe';
import { bindTracks } from '../trackBinding';
import { directorBuild, directorOptions, directorTreatment } from './directorTools';
import { findShots } from './directorSearchTool';
import type { FrameVector } from '../director/shotSearch';
import { critiqueOfLastBuild, directorCritique, directorFix } from './directorRepairTools';
import { customShaderTool } from './customShaderTool';
import { customGraphicTool } from './customGraphicTool';
import { parseTimeEffectArgs, planTimedEffect } from './timeEffectTool';
import { freezeFrameTool } from './freezeFrameTool';
import { reverseTool } from './reverseTool';
import { parseCleanSpeechArgs, planCleanSpeech } from './cleanSpeechTool';
import { parseRestyleArgs, planRestyle } from './restyleTextTool';
import { applySignatureTool } from './signatureTools';
import { applyLookTool } from './lookTools';
import { reviewExportTool } from '../exportReview';
import { directorReshape } from './directorReshapeTool';
export { REELS_TOOL_NAMES, REELS_TOOL_SCHEMAS } from './reelsToolSchemas';

type Args = Record<string, unknown>;

export interface ReelsDeps {
  api: AnalyzeApi;
  /** shot tags for a project (the app reads them from the visual-search model); tests leave it out */
  shotTags?: (projectId: string) => AnalyzeApi['shotTags'];
  /** RS-1256: the visual model's vectors for the clips' frames, and the given phrases as vectors (null when the model is not installed); tests inject fakes */
  semantic?: (projectId: string, assets: MediaAsset[], texts: string[]) => Promise<{ frames: FrameVector[]; queries: number[][] } | null>;
}

export function projectId(ctx: AgentContext): string {
  return ctx.getProjectId?.() ?? 'current';
}

export function commit(ctx: AgentContext, actions: AtomicAction[], label: string) {
  const bound = bindTracks({ type: 'batch', label, actions }, ctx.getState());
  ctx.commands.batch(bound.actions, bound.label);
}

export async function execReelsTool(name: string, args: Args, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const state = ctx.getState();
  switch (name) {
    case 'reels_lint':
      return lintReel(state);

    case 'reels_apply_look':
      return applyLookTool(args, ctx);

    case 'reels_apply_signature':
      return applySignatureTool(args, ctx);

    case 'reels_director_options':
      // RS-1258: `find` phrases are searched in the same call
      return directorOptions(args, ctx, deps, findShots);

    case 'reels_director_build':
      // RS-1258: the first build of a directed reel returns the critique with it
      return directorBuild(args, ctx, deps, critiqueOfLastBuild);

    case 'reels_director_treatment':
      return directorTreatment(args, ctx);

    case 'reels_find_shots':
      return findShots(args, ctx, deps);

    case 'reels_director_reshape':
      return directorReshape(args, ctx, deps);

    case 'reels_review_export':
      return reviewExportTool();

    case 'reels_director_critique':
      return directorCritique(ctx);

    case 'reels_director_fix':
      return directorFix(args, ctx, deps);

    case 'reels_custom_shader':
      return customShaderTool(args);
    case 'reels_custom_graphic':
      return customGraphicTool(args);

    case 'reels_freeze_frame': {
      const out = await freezeFrameTool(args, state, deps.api, () => crypto.randomUUID());
      if ('error' in out) return out;
      commit(ctx, out.plan.actions, `Freeze frame at ${(out.plan.atFrame / state.fps).toFixed(2)} s`);
      return {
        ok: true, stillItemId: out.plan.stillId, atSec: out.plan.atFrame / state.fps, heldSec: out.plan.holdFrames / state.fps, sourceSec: out.plan.sourceSec,
        ...(out.clamped ? { note: `held only ${(out.plan.holdFrames / state.fps).toFixed(2)} s: the clip ends there` } : {}),
      };
    }

    case 'reels_reverse': {
      const out = await reverseTool(args, state, deps.api, () => crypto.randomUUID());
      if ('error' in out) return out;
      commit(ctx, out.actions, out.label);
      return { ok: true, itemId: out.itemId, fromSec: out.from / state.fps, toSec: out.to / state.fps, forwards: args.forwards === true };
    }

    case 'reels_clean_speech': {
      const parsed = parseCleanSpeechArgs(args);
      if ('error' in parsed) return parsed;
      const out = planCleanSpeech(state, parsed, () => crypto.randomUUID());
      if ('error' in out) return out;
      if (!out.actions.length) return { ok: true, changed: false, note: `nothing to cut at ${parsed.level}`, clips: out.clips };
      commit(ctx, out.actions, `Clean up speech (${parsed.level})`);
      return { ok: true, changed: true, level: parsed.level, clips: out.clips };
    }

    case 'reels_restyle_text': {
      const parsed = parseRestyleArgs(args);
      if ('error' in parsed) return parsed;
      const out = planRestyle(state, parsed, () => crypto.randomUUID().slice(0, 8));
      if ('error' in out) return out;
      commit(ctx, out.actions, `Restyle "${out.text}" as ${parsed.style}`);
      return { ok: true, text: out.text, style: parsed.style, fromSec: out.from / state.fps, toSec: out.to / state.fps, replacedItems: out.removed, ...(out.warnings.length ? { warnings: out.warnings } : {}) };
    }

    case 'reels_time_effect': {
      const parsed = parseTimeEffectArgs(args);
      if ('error' in parsed) return parsed;
      const out = await planTimedEffect(state, ctx.getDoc().assets ?? [], parsed, deps.api);
      if (!out.ok) return { error: out.error };
      ctx.commands.batch(out.actions, out.label);
      return { ok: true, effect: parsed.effect, timing: parsed.timing, clips: out.clips, beats: out.beats };
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

  }
  return { error: `unknown tool ${name}` };
}
