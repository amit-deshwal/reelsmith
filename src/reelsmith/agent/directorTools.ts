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
import { aimMarkers } from '../director/aimMarkers';
import { clearCaptionsOfPeople } from '../director/clearOfPeople';
import { findPeople } from '../peopleFinder';
import { lintReel } from '../reelLint';
import { execFramesTool } from '../../agent/tools/frames-tool';
import type { ClipFeatures } from '../assembler/scoring';
import type { ClipShotTags } from '../shotTags';
import { shotLogLines, type ShotLogClip } from '../director/shotLog';
import { directorSession, updateDirectorSession } from '../director/directorSession';
import { PLAN_BRIEF, checkTreatment, parseTreatment, treatmentIds } from '../director/treatment';
import { catalogKind, catalogSlice } from '../director/catalogText';
import { critiqueFrames, critiquePlan, criticBrief } from '../director/critique';

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

/**
 * Numbered contact sheets of every clip in one go (cells "n·seconds"), instead of one frame call per clip. RS-1214: the
 * cells are each clip's best moments from the shot log (fixed points only for clips the analysis could not read).
 */
async function contactSheets(assets: MediaAsset[], moments: Map<number, number[]>, ctx: AgentContext, deps: ReelsDeps) {
  if (!assets.length || !deps.api.selectionSheet || !framesAllowed(projectId(ctx))) return null;
  const cells = assets.flatMap((a, i) => (a.kind === 'image' ? [{ asset: a, atSec: 0, label: `${i + 1}` }]
    : (moments.get(i + 1) ?? [0]).map((t) => ({ asset: a, atSec: t, label: `${i + 1}·${t}s` }))));
  const made = await deps.api.selectionSheet(cells).catch(() => null);
  if (!made?.sheets.length) return null;
  return {
    images: made.sheets.map((sheet, i) => ({ frame: i, base64: sheet.base64 })),
    note: `${made.sheets.length} contact sheet(s), 5 cells per row; a cell "n·t s" is clip #n at t seconds, taken at each video's best moments (the shot log's "best @"), photos once.${made.skipped.length ? ` Not on the sheets (could not be read): ${made.skipped.join(', ')}.` : ''}`,
  };
}

/** How long stage 1 waits for the clip analysis before logging the rest as "not analysed" (4K phone clips take ~10 s each). */
const ANALYSIS_BUDGET_MS = 90_000;

/**
 * The build's clip analysis and shot tags, awaited for the shot log (RS-1214; they used to only warm in the background
 * while the agent planned blind). Three clips at a time like the build; the server caches them, so the build reuses them.
 */
async function analyseClips(assets: MediaAsset[], fps: number, ctx: AgentContext, deps: ReelsDeps): Promise<{ features: Map<string, ClipFeatures | null>; tags: Map<string, ClipShotTags> }> {
  const features = new Map<string, ClipFeatures | null>();
  const videos = assets.filter((a) => a.kind === 'video');
  let next = 0;
  const work = Promise.all(Array.from({ length: Math.min(3, videos.length) }, async () => {
    while (next < videos.length) {
      const a = videos[next++]!;
      features.set(a.id, await deps.api.clipFeatures(a, fps).catch(() => null));
      ctx.onToolProgress?.(`Watching the clips (${features.size}/${videos.length})`);
    }
  }));
  let tags = new Map<string, ClipShotTags>();
  const tagsWork = warmShotTags(assets, ctx, deps).then((t) => { if (t instanceof Map) tags = t as Map<string, ClipShotTags>; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => { timer = setTimeout(resolve, ANALYSIS_BUDGET_MS); });
  await Promise.race([Promise.all([work, tagsWork]), budget]);
  clearTimeout(timer);
  return { features: new Map(features), tags };
}

/** Shot tags being read while the agent plans, by project; the build waits for them instead of loading the model again. */
const warmingTags = new Map<string, Promise<unknown>>();

/** The shot tags load the visual model and read every clip (about 10 s); the build waits for the same work. */
function warmShotTags(assets: MediaAsset[], ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const load = deps.shotTags?.(projectId(ctx));
  const id = projectId(ctx);
  if (!load || !assets.length) return Promise.resolve(undefined);
  const running = warmingTags.get(id);
  if (running) return running;
  const work: Promise<unknown> = load(assets).catch(() => undefined).finally(() => { if (warmingTags.get(id) === work) warmingTags.delete(id); });
  warmingTags.set(id, work);
  return work;
}

export async function directorOptions(ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const fps = ctx.getState().fps;
  const assets = (ctx.getDoc().assets ?? []).filter((a) => VISUAL.has(a.kind) || a.kind === 'audio');
  const visual = directorVisuals(ctx);
  const songs = [...assets.filter((a) => a.kind === 'audio').slice(0, 3), ...libraryMusic(ctx)];
  const beats = new Map(await Promise.all(songs.map(async (a) => [a.id, await tempo(a, deps)] as const)));
  // stage 1: watch the footage, then log it and take the sheet cells at each clip's best moments
  const { features, tags } = await analyseClips(visual, fps, ctx, deps);
  const shape = (a: MediaAsset) => (a.width && a.height ? (a.height > a.width ? 'portrait' : a.height < a.width ? 'landscape' : 'square') : undefined);
  const logClips: ShotLogClip[] = visual.map((a, i) => ({
    n: i + 1, kind: a.kind === 'image' ? 'image' : 'video', seconds: a.durationInFrames / fps,
    ...(shape(a) ? { shape: shape(a) } : {}), features: features.get(a.id) ?? null, ...(tags.get(a.id) ? { tags: tags.get(a.id) } : {}),
  }));
  const k = sheetSamples(visual.filter((a) => a.kind !== 'image').length, visual.filter((a) => a.kind === 'image').length).length;
  const log = shotLogLines(logClips, fps, k);
  const sheets = await contactSheets(visual, log.moments, ctx, deps);
  const firstSong = assets.find((a) => a.kind === 'audio');
  const sug = firstSong ? (beats.get(firstSong.id) as { bpm?: number; suggest?: { beatsFor18s: number; dropAtBeat?: number } } | undefined) : undefined;
  updateDirectorSession(projectId(ctx), {
    fps, clips: logClips, treatment: undefined, lastBuild: undefined,
    ...(firstSong ? { song: { assetId: firstSong.id, ...(sug?.bpm ? { bpm: sug.bpm } : {}), ...(sug?.suggest ? { beatsFor18s: sug.suggest.beatsFor18s, ...(sug.suggest.dropAtBeat !== undefined ? { dropAtBeat: sug.suggest.dropAtBeat } : {}) } : {}) } } : {}),
  });
  const song = (a: MediaAsset) => ({ assetId: a.id, name: a.name, seconds: secs(a.durationInFrames, fps), ...(beats.get(a.id) ?? {}) });
  adoptCustomGraphics(ctx.getState().items as never);
  const custom = Object.values(CUSTOM_FX).map((d) => d.id).concat(listCustomTransitions().map((t) => t.id), listCustomGraphics().map((g) => g.id));
  // RS-1210: only what is particular to this project. The catalogue (moves, styles, effects, transitions, looks, sounds)
  // is in the reels-director skill; a result over 16k characters would reach an external agent only as an artifact.
  return {
    ...(sheets ? { __images: sheets.images } : {}),
    clips: log.lines.map((line, i) => line.replace(/^#\d+ /, `#${i + 1} ${visual[i]!.name} `)),
    shotLogNote: '"best @t" = its strongest moments (sharp, lit, a subject, some life), best first; "moving" = where it moves most; "talking" = speech; "soft/dark" = avoid those seconds. Cast from these with "#n@t".',
    clipRefs: 'In the plan, name a clip by its number: "#7", or "#7@4.5" to start it at 4.5 s of the source.',
    sheetNote: sheets ? sheets.note : 'No contact sheets (frame sharing is off or unavailable): choose from names and seconds, or view_asset_frames for one or two clips.',
    songs: assets.filter((a) => a.kind === 'audio').slice(0, 3).map(song),
    libraryMusic: libraryMusic(ctx).map(song),
    songHint: 'Use each song\'s suggest: musicStart as given, sections adding up to beatsFor18s (more or fewer for a longer or shorter reel), and the peak section starting at dropAtBeat. No other timing arithmetic is needed.',
    ...(custom.length ? { customShaders: custom } : {}),
    timelineIsEmpty: ctx.getState().items.length === 0,
    next: 'Stage 2: write the treatment (two concepts, the tone, hero shots, the arc on the song, the signature, the kit from the menu in the skill) and call reels_director_treatment. Do not write the plan yet.',
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
  if (out.action.actions.some((a) => a.type === 'add' && (a.item as { props?: { rsAim?: unknown } }).props?.rsAim)) ctx.onToolProgress?.('Finding who the markers point at');
  out.messages.push(...await aimMarkers(out.action.actions, findPeople));
  const canvas = out.action.actions.find((a): a is Extract<AtomicAction, { type: 'setCanvas' }> => a.type === 'setCanvas');
  if (canvas) { ctx.onToolProgress?.('Keeping captions off faces'); await clearCaptionsOfPeople(out.action.actions, assets, canvas, state.fps, findPeople); }
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
  const builds = (directorSession(projectId(ctx))?.lastBuild?.builds ?? 0) + 1;
  updateDirectorSession(projectId(ctx), { fps, lastBuild: { plan, spans, builds } });
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
    // RS-1214: a director run's first build goes to the critique stage before any rebuild
    next: (builds === 1 && directorSession(projectId(ctx))?.treatment
      ? 'Stage 4: call reels_director_critique now (it looks closer than these frames); fix these findings in the same rebuild it leads to. Do not rebuild before it.'
      : builds >= 2 && directorSession(projectId(ctx))?.treatment
        ? 'Check these frames against your upgrades; rebuild once more only for something clearly broken (a word cut off, a mark on the wrong person, a refused item), otherwise finish.'
      : findings.length || lint.errors
        ? 'Fix the review findings and anything clearly wrong in the frames with ONE rebuild (replaceTimeline true), then finish.'
        : 'Check the frames; if nothing is clearly wrong, finish.')
      + ' To finish: call review_edit_session if you opened an edit session (nothing reaches the timeline until it returns applied), then report to the user in three short lines. Do not call view_timeline_frames or reels_lint separately.',
  };
}

/** Ids the slice may carry: every move of the arc and a capped kit, so the result stays far under the 16k cap. */
const SLICE_CAP = { style: 4, transition: 5, effect: 6, graphic: 5 } as const;

/**
 * RS-1214 stage 2: the agent's treatment, checked against the shot log, the song and its own tone; returns the full
 * catalogue entries (params, clip counts) for the kit it chose and how to write the plan. `lookup` alone returns entries
 * for any ids (a later change that needs a style or move the treatment did not pick).
 */
export function directorTreatment(args: Record<string, unknown>, ctx: AgentContext): unknown {
  const lookup = Array.isArray(args.lookup) ? args.lookup.filter((x): x is string => typeof x === 'string') : [];
  if (lookup.length && !args.parts) {
    const known = lookup.filter((id) => catalogKind(id));
    return { catalog: catalogSlice(known.slice(0, 24)), ...(known.length < lookup.length ? { unknown: lookup.filter((id) => !catalogKind(id)) } : {}) };
  }
  const parsed = parseTreatment(args);
  if (!parsed.ok) return { error: `The treatment is incomplete: ${parsed.errors.join('; ')}` };
  const t = parsed.treatment;
  const id = projectId(ctx);
  const session = directorSession(id);
  const findings = checkTreatment(t, { clips: session?.clips ?? [], fps: session?.fps ?? ctx.getState().fps, ...(session?.song ? { song: session.song } : {}) });
  updateDirectorSession(id, { treatment: t, lastBuild: undefined });
  const count: Record<string, number> = {};
  const ids = treatmentIds(t).filter((x) => {
    const kind = catalogKind(x);
    if (!kind) return false;
    count[kind] = (count[kind] ?? 0) + 1;
    return kind === 'move' || kind === 'look' || count[kind]! <= (SLICE_CAP[kind as keyof typeof SLICE_CAP] ?? 4);
  });
  return {
    ok: true,
    concept: t.concepts[t.chosen]?.name,
    tone: t.tone,
    findings,
    catalog: catalogSlice(ids),
    planBrief: PLAN_BRIEF,
    next: findings.length
      ? 'Fix every finding as you write the plan (no need to send the treatment again unless the concept changes), then call reels_director_build.'
      : 'Write the plan from this treatment and call reels_director_build.',
  };
}

/** Frames the frame tool renders in one call (one contact sheet each). */
const FRAMES_PER_SHEET = 8;

/**
 * RS-1214 stage 4: a closer look at the built reel (about three frames a section and every line at its fullest, in
 * sheets of eight) with the critic's checklist and the checks frames cannot show, before the one rebuild.
 */
export async function directorCritique(ctx: AgentContext): Promise<unknown> {
  const id = projectId(ctx);
  const session = directorSession(id);
  const built = session?.lastBuild;
  if (!built) return { error: 'Nothing to critique yet: build the reel with reels_director_build first (the critique reads the last build of this session).' };
  const fps = ctx.getState().fps;
  const picks = critiqueFrames(built.plan, built.spans, fps);
  const images: unknown[] = [];
  const sheets: string[] = [];
  if (framesAllowed(id)) {
    for (let i = 0; i < picks.length; i += FRAMES_PER_SHEET) {
      const chunk = picks.slice(i, i + FRAMES_PER_SHEET);
      ctx.onToolProgress?.(`Looking closer (${Math.min(picks.length, i + FRAMES_PER_SHEET)}/${picks.length} frames)`);
      const out = await execFramesTool('view_timeline_frames', { frames: chunk.map((p) => p.frame) }, ctx).catch(() => null) as { __images?: unknown[] } | null;
      if (!out?.__images?.length) continue;
      images.push(...out.__images);
      sheets.push(`image ${images.length}: ${chunk.map((p, j) => `[${j + 1}] ${(p.frame / fps).toFixed(1)}s ${p.label}`).join(' · ')}`);
    }
  }
  const findings = critiquePlan(built.plan, built.spans, session?.treatment);
  const lint = lintReel(ctx.getState());
  return {
    ...(images.length ? { __images: images } : {}),
    frames: images.length ? sheets : 'frames unavailable: judge from the plan and the checks',
    findings,
    textWarnings: lint.issues.slice(0, 8).map((x) => x.message),
    // (a key named "signature" is redacted as a secret on its way to an external agent: runtime-artifact.ts SIGNED_QUERY)
    ...(session?.treatment ? { treatment: { tone: session.treatment.tone, signatureMoment: session.treatment.signature, concept: session.treatment.concepts[session.treatment.chosen]?.name } } : {}),
    checklist: criticBrief(session?.treatment),
    next: 'Answer the checklist from the frames, write your upgrades, then ONE rebuild (reels_director_build, replaceTimeline true) with all of them and these findings. After it: finish (review_edit_session if you opened an edit session, then report).',
  };
}
