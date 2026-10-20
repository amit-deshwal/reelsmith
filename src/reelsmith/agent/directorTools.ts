// Director mode tools (RS-1201): the agent reads the moves catalogue with the project's media in one call, then builds
// the reel from its own plan (sections of moves, clips, lines) in one more, as one undo step.
import { parsePlan } from '../../../shared/reelsmith/directorPlan';
import type { AgentContext } from '../../agent/context';
import type { AtomicAction } from '../../editor/reducerActions';
import type { MediaAsset } from '../../editor/types';
import { framesAllowed } from '../framePrivacy';
import { runRecipe } from '../runRecipe';
import { defaultValues } from '../setupForm';
import { directorRecipe, resolvePlanSections } from '../director/assembleDirector';
import { CUSTOM_FX } from '../../gl/fx/effects';
import { listCustomTransitions } from '../../gl/customTransitions';
import { adoptCustomGraphics, listCustomGraphics } from '../director/customGraphics';
import { commit, projectId, type ReelsDeps } from './reelsTools';
import { reviewDirectorPlan } from '../director/review';
import { lintReel } from '../reelLint';
import { execFramesTool } from '../../agent/tools/frames-tool';

const VISUAL = new Set(['video', 'image']);
const secs = (frames: number, fps: number) => Math.round((frames / fps) * 10) / 10;

/** The bundled songs, as media assets; added to the project only when a plan uses one. */
function libraryMusic(ctx: AgentContext): MediaAsset[] {
  return (ctx.audio ?? []).filter((t) => t.category === 'music').map((t) => ({ id: t.id, name: t.name, kind: 'audio' as const, src: t.src, durationInFrames: t.durationInFrames }));
}

async function tempo(asset: MediaAsset, deps: ReelsDeps): Promise<{ beat: 'steady' | 'none' | 'unknown'; bpm?: number; firstBeatSec?: number; dropSec?: number; loudestSec?: number }> {
  try {
    const g = await deps.api.musicGrid(asset);
    if (!g || g.beatTimesSec.length < 2) return { beat: 'none' };
    const gaps = g.beatTimesSec.slice(1).map((t, i) => t - g.beatTimesSec[i]!).filter((x) => x > 0.15 && x < 2).sort((a, b) => a - b);
    const r = (x: number) => Math.round(x * 10) / 10;
    const bpm = gaps.length ? Math.round(60 / gaps[Math.floor(gaps.length / 2)]!) : undefined;
    return {
      beat: 'steady', ...(bpm ? { bpm } : {}), firstBeatSec: Math.round((g.beatTimesSec[g.downbeatIndex] ?? 0) * 100) / 100,
      ...(g.dropSec ? { dropSec: r(g.dropSec) } : {}), ...(g.loudestStartSec ? { loudestSec: r(g.loudestStartSec) } : {}),
      ...(bpm ? { suggest: songSuggestion(g, bpm, g.durationSec ?? asset.durationInFrames / 30) } : {}),
    };
  } catch { return { beat: 'unknown' }; }
}

/**
 * RS-1212: the timing arithmetic done for the agent (it was a large share of its planning time): where to start the
 * song, how many beats make about 18 s, and which beat of the reel the drop lands on.
 */
export function songSuggestion(g: { beatTimesSec: number[]; downbeatIndex: number; dropSec?: number; loudestStartSec?: number }, bpm: number, seconds: number) {
  const beats = g.beatTimesSec;
  const first = g.downbeatIndex;
  const nearest = (t: number) => { let k = first; for (let i = first; i < beats.length; i += 1) if (Math.abs(beats[i]! - t) < Math.abs(beats[k]! - t)) k = i; return k; };
  // a short song from its first downbeat; a long one 8 beats before the drop (or at its loudest part) so the reel rises into it
  let startIdx = first;
  if (seconds > 40) {
    if (g.dropSec !== undefined) startIdx = Math.max(first, nearest(g.dropSec) - 8);
    else if (g.loudestStartSec !== undefined) startIdx = nearest(g.loudestStartSec);
  }
  const musicStart = Math.round((beats[startIdx] ?? 0) * 100) / 100;
  const beatsFor18s = Math.max(16, Math.round((18 * bpm) / 60 / 4) * 4);
  const dropAtBeat = g.dropSec !== undefined ? nearest(g.dropSec) - startIdx : undefined;
  return {
    musicStart, beatsFor18s, ...(dropAtBeat !== undefined && dropAtBeat > 0 && dropAtBeat < beatsFor18s ? { dropAtBeat } : {}),
    note: `musicStart ${musicStart}; about ${beatsFor18s} beats for 18 s${dropAtBeat !== undefined && dropAtBeat > 0 && dropAtBeat < beatsFor18s ? `; the drop is beat ${dropAtBeat} of the reel: start the peak section there` : ''}`,
  };
}

/** Cells across all sheets (4 sheets of 20): every clip must be on them, so long lists get fewer moments per video. */
const SHEET_CELL_BUDGET = 80;

/**
 * Where each video is sampled: up to four moments (10/37/63/90% of its length) so the agent sees how a clip starts,
 * develops and ends; fewer, evenly spread, when there are too many clips for four each. Photos take one cell.
 */
export function sheetSamples(videos: number, photos: number): number[] {
  const k = Math.max(1, Math.min(4, Math.floor((SHEET_CELL_BUDGET - photos) / Math.max(1, videos))));
  return k === 1 ? [0.5] : Array.from({ length: k }, (_, j) => Math.round((0.1 + (0.8 * j) / (k - 1)) * 100) / 100);
}

/** Numbered contact sheets of every clip in one go (cells "n·seconds"), instead of one frame call per clip. */
async function contactSheets(assets: MediaAsset[], fps: number, ctx: AgentContext, deps: ReelsDeps) {
  if (!assets.length || !deps.api.selectionSheet || !framesAllowed(projectId(ctx))) return null;
  const samples = sheetSamples(assets.filter((a) => a.kind !== 'image').length, assets.filter((a) => a.kind === 'image').length);
  const cells = assets.flatMap((a, i) => {
    const sec = a.durationInFrames / fps;
    return a.kind === 'image' ? [{ asset: a, atSec: 0, label: `${i + 1}` }]
      : samples.map((p) => { const t = Math.round(p * sec * 10) / 10; return { asset: a, atSec: t, label: `${i + 1}·${t}s` }; });
  });
  const made = await deps.api.selectionSheet(cells).catch(() => null);
  if (!made?.sheets.length) return null;
  const at = samples.map((p) => Math.round(p * 100)).join('/');
  return {
    images: made.sheets.map((sheet, i) => ({ frame: i, base64: sheet.base64 })),
    note: `${made.sheets.length} contact sheet(s), 5 cells per row; a cell "n·t s" is clip #n at t seconds (videos at ${at}% of their length, photos once).${made.skipped.length ? ` Not on the sheets (could not be read): ${made.skipped.join(', ')}.` : ''}`,
  };
}

/**
 * The build's clip analysis, started while the agent plans (that takes a minute or more), so the first build finds it
 * cached. Three at a time, like the build; failures are left for the build to report.
 */
function warmClipAnalysis(assets: MediaAsset[], fps: number, deps: ReelsDeps): void {
  let next = 0;
  for (let w = 0; w < Math.min(3, assets.length); w += 1) {
    void (async () => { while (next < assets.length) await deps.api.clipFeatures(assets[next++]!, fps); })().catch(() => {});
  }
}

/** Shot tags being read while the agent plans, by project; the build waits for them instead of loading the model again. */
const warmingTags = new Map<string, Promise<unknown>>();

/** The first build's shot tags load the visual model and read every clip (about 10 s): start that during planning too. */
function warmShotTags(assets: MediaAsset[], ctx: AgentContext, deps: ReelsDeps): void {
  const load = deps.shotTags?.(projectId(ctx));
  if (!load || !assets.length || warmingTags.has(projectId(ctx))) return;
  const id = projectId(ctx);
  const work: Promise<unknown> = load(assets).catch(() => undefined).finally(() => { if (warmingTags.get(id) === work) warmingTags.delete(id); });
  warmingTags.set(id, work);
}

export async function directorOptions(ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const fps = ctx.getState().fps;
  const assets = (ctx.getDoc().assets ?? []).filter((a) => VISUAL.has(a.kind) || a.kind === 'audio');
  const visual = directorVisuals(ctx);
  const songs = [...assets.filter((a) => a.kind === 'audio').slice(0, 3), ...libraryMusic(ctx)];
  const beats = new Map(await Promise.all(songs.map(async (a) => [a.id, await tempo(a, deps)] as const)));
  const sheets = await contactSheets(visual, fps, ctx, deps);
  warmClipAnalysis(visual, fps, deps);
  warmShotTags(visual, ctx, deps);
  const song = (a: MediaAsset) => ({ assetId: a.id, name: a.name, seconds: secs(a.durationInFrames, fps), ...(beats.get(a.id) ?? {}) });
  adoptCustomGraphics(ctx.getState().items as never);
  const custom = Object.values(CUSTOM_FX).map((d) => d.id).concat(listCustomTransitions().map((t) => t.id), listCustomGraphics().map((g) => g.id));
  // RS-1210: only what is particular to this project. The catalogue (moves, styles, effects, transitions, looks, sounds)
  // is in the reels-director skill; a result over 16k characters would reach an external agent only as an artifact.
  return {
    ...(sheets ? { __images: sheets.images } : {}),
    clips: visual.map((a, i) => `#${i + 1} ${a.name} ${secs(a.durationInFrames, fps)}s ${a.kind === 'image' ? 'photo' : 'video'}${a.width && a.height ? ` ${a.height > a.width ? 'portrait' : a.height < a.width ? 'landscape' : 'square'}` : ''}`),
    clipRefs: 'In the plan, name a clip by its number: "#7", or "#7@4.5" to start it at 4.5 s of the source.',
    sheetNote: sheets ? sheets.note : 'No contact sheets (frame sharing is off or unavailable): choose from names and seconds, or view_asset_frames for one or two clips.',
    songs: assets.filter((a) => a.kind === 'audio').slice(0, 3).map(song),
    libraryMusic: libraryMusic(ctx).map(song),
    songHint: 'Use each song\'s suggest: musicStart as given, sections adding up to beatsFor18s (more or fewer for a longer or shorter reel), and the peak section starting at dropAtBeat. No other timing arithmetic is needed.',
    ...(custom.length ? { customShaders: custom } : {}),
    timelineIsEmpty: ctx.getState().items.length === 0,
    next: 'The catalogue is in the reels-director skill. Write the plan and call reels_director_build once.',
  };
}

/** The pictures the director sees, numbered #1.. in this order (options and build must agree). */
function directorVisuals(ctx: AgentContext): MediaAsset[] {
  return (ctx.getDoc().assets ?? []).filter((a) => VISUAL.has(a.kind)).slice(0, 60);
}

/** "#7" / "#7@4.5" → that clip's assetId (keeping the @start); anything else unchanged. */
export function resolveClipRef(ref: string, visual: readonly Pick<MediaAsset, 'id'>[]): string | null {
  const m = /^#(\d+)(@[\d.]+)?$/.exec(ref.trim());
  if (!m) return ref;
  const a = visual[Number(m[1]) - 1];
  return a ? `${a.id}${m[2] ?? ''}` : null;
}

export async function directorBuild(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const parsed = parsePlan(args.plan);
  if (!parsed.ok) return { error: `The plan is not valid: ${parsed.errors.join('; ')}` };
  const plan = parsed.plan;
  // catalogue mistakes come back at once, before the clip analysis the build waits on
  // (a custom graphic already on the timeline from an earlier session is picked up again)
  adoptCustomGraphics(ctx.getState().items as never);
  const problems: string[] = [];
  resolvePlanSections(plan, [], problems);
  if (problems.length) return { error: `The plan has problems: ${problems.join('; ')}` };
  const state = ctx.getState();
  if (state.items.length > 0 && args.replaceTimeline !== true) return { error: 'The timeline already has items and building replaces it. Ask the user, then call again with replaceTimeline true (one undo step restores it).' };
  const assets = [...(ctx.getDoc().assets ?? [])];
  let added: MediaAsset | undefined;
  if (plan.music) {
    const want = plan.music.toLowerCase();
    const hit = [...assets.filter((a) => a.kind === 'audio'), ...libraryMusic(ctx)].find((a) => a.id.toLowerCase() === want || a.name.toLowerCase() === want);
    if (!hit) return { error: `unknown music ${JSON.stringify(plan.music)}; use a song assetId from reels_director_options` };
    if (!assets.some((a) => a.id === hit.id)) { assets.push(hit); added = hit; }
    plan.music = hit.id;
  }
  // "#n" references from the numbered clip list
  const visual = directorVisuals(ctx);
  const badRefs: string[] = [];
  for (const sec of plan.sections) if (sec.clips) sec.clips = sec.clips.map((ref) => { const r = resolveClipRef(ref, visual); if (r === null) badRefs.push(ref); return r ?? ref; });
  if (badRefs.length) return { error: `no clip ${badRefs.join(', ')} (the list has #1-#${visual.length})` };
  const named = new Set(plan.sections.flatMap((s) => s.clips ?? []).map((ref) => ref.split('@')[0]!));
  const unknown = [...named].filter((id) => !assets.some((a) => a.id === id && VISUAL.has(a.kind)));
  if (unknown.length) return { error: `unknown clip assetIds: ${unknown.join(', ')} (use assetIds from reels_director_options media)` };
  const recipe = directorRecipe(plan);
  const values = defaultValues(recipe);
  values.media.clips = assets.filter((a) => VISUAL.has(a.kind)).map((a) => ({ assetId: a.id, kind: a.kind as 'video' | 'image' }));
  if (plan.music) values.media.music = [{ assetId: plan.music, kind: 'audio' }];
  let out;
  const tagsWarming = warmingTags.get(projectId(ctx));
  if (tagsWarming) { ctx.onToolProgress?.('Reading what the shots show'); await tagsWarming; }
  try {
    out = await runRecipe({ ...deps.api, ...(deps.shotTags ? { shotTags: deps.shotTags(projectId(ctx)) } : {}) }, {
      recipe, values, assets, fps: state.fps, replaceTimeline: true, plan,
      ...(typeof args.seed === 'number' && Number.isFinite(args.seed) ? { seed: Math.round(args.seed) } : {}),
      onProgress: ctx.onToolProgress,
    });
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  if (!out.action) return { error: out.messages.join('; ') || 'could not build the plan' };
  commit(ctx, [...(added ? [{ type: 'addAsset', asset: added } as AtomicAction] : []), ...out.action.actions], 'Director: build reel');
  const report = out.result.report;
  // RS-1211: the review comes with the build: one frame per section, the lint, and the plan review
  const fps = state.fps;
  const spans = plan.sections.map((_, i) => {
    const mine = out.action!.actions.filter((a): a is Extract<AtomicAction, { type: 'add' }> => a.type === 'add' && String((a.item.props as { rsSection?: unknown } | undefined)?.rsSection ?? '').startsWith(`${i + 1}-`));
    const from = mine.length ? Math.min(...mine.map((a) => a.startFrame ?? 0)) : 0;
    const to = mine.length ? Math.max(...mine.map((a) => (a.startFrame ?? 0) + a.item.durationInFrames)) : from;
    return { from: from / fps, to: to / fps };
  });
  const songAsset = plan.music ? assets.find((a) => a.id === plan.music) : undefined;
  const song = songAsset ? { seconds: songAsset.durationInFrames / fps, ...(await tempo(songAsset, deps)) } : undefined;
  const findings = reviewDirectorPlan({ plan, spans, musicStartSec: report.musicStartSec, ...(song ? { song } : {}) });
  const lint = lintReel(ctx.getState());
  // a frame 45% into each section (its start is often mid-transition or a flash)
  const frames = spans.map((s) => Math.round((s.from + (s.to - s.from) * 0.45) * fps));
  const sheet = framesAllowed(projectId(ctx)) ? await execFramesTool('view_timeline_frames', { frames }, ctx).catch(() => null) as { __images?: unknown[] } | null : null;
  return {
    ...(sheet?.__images ? { __images: sheet.__images } : {}),
    ok: true, ratio: plan.ratio, seconds: secs(report.totalFrames, fps), sections: plan.sections.length, clipsUsed: report.usedAssetIds.length,
    ...(added ? { musicAdded: added.name } : {}), notes: out.messages.slice(0, 12),
    review: {
      frames: sheet?.__images ? spans.map((s, i) => `image ${i + 1}: section ${i} (${plan.sections[i]!.move}) at ${(s.from + (s.to - s.from) * 0.45).toFixed(1)} s`) : 'frames unavailable',
      findings,
      lint: { errors: lint.errors, warnings: lint.warnings, issues: lint.issues.slice(0, 8).map((x) => x.message) },
    },
    // an external agent's build is a draft until review_edit_session applies it; a bare "report" made it skip that
    next: (findings.length || lint.errors
      ? 'Fix the review findings and anything clearly wrong in the frames with ONE rebuild (replaceTimeline true), then finish.'
      : 'Check the frames; if nothing is clearly wrong, finish.')
      + ' To finish: call review_edit_session if you opened an edit session (nothing reaches the timeline until it returns applied), then report to the user in three short lines. Do not call view_timeline_frames or reels_lint separately.',
  };
}
