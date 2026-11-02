// Director mode tools (RS-1201): the agent reads the moves catalogue with the project's media in one call, then builds
// the reel from its own plan (sections of moves, clips, lines) in one more, as one undo step.
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
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
import { finishDirectorActions, sectionSpans, stampDirector } from '../director/finishBuild';
import { lintReel } from '../reelLint';
import { execFramesTool } from '../../agent/tools/frames-tool';
import type { ClipFeatures } from '../assembler/scoring';
import type { ClipShotTags } from '../shotTags';
import { filmedLabels, shotLogLines, type ShotLogClip } from '../director/shotLog';
import { directorSession, restoreDirectorSession, savedDirector, updateDirectorSession } from '../director/directorSession';
import { PLAN_BRIEF, checkTreatment, parseTreatment, treatmentCard, treatmentIds } from '../director/treatment';
import { catalogKind, catalogSlice } from '../director/catalogText';
import { soundCheck } from '../director/soundCheck';
import { referenceLine, referenceProfile } from '../director/reference';
import { motionRuleText } from '../director/motionRules';
import { missingThings } from '../director/storyThings';
import type { Defect } from '../director/critique';
import { songMap, songMapText } from '../director/songMap';
import { songReportLine } from '../exportMusic';
import { brandAction, brandKitText, brandWords, type BrandKit } from '../../../shared/reelsmith/brandKit';
import { directorTimelineFps } from '../director/footageRate';

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
export function songSuggestion(g: { beatTimesSec: number[]; downbeatIndex: number; dropSec?: number; loudestStartSec?: number; energyPerBeat?: number[]; beatsPerBar?: number }, bpm: number, seconds: number) {
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
  // RS-1224: quiet and loud bars over the reel and a little past it, so the pace can follow the song
  const map = songMap(g.energyPerBeat, startIdx, g.beatsPerBar ?? 4, Math.min(16, Math.ceil((beatsFor18s * 1.5) / (g.beatsPerBar ?? 4))));
  return {
    musicStart, beatsFor18s, ...(dropAtBeat !== undefined && dropAtBeat > 0 && dropAtBeat < beatsFor18s ? { dropAtBeat } : {}),
    ...(map ? { energy: songMapText(map) } : {}),
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

/** RS-1250: an empty timeline takes the footage's 60 fps before anything is analysed or placed (the note says so). */
async function matchFootageRate(ctx: AgentContext, deps: ReelsDeps): Promise<string | undefined> {
  const state = ctx.getState();
  if (state.fps >= 50 || !deps.api.mediaFps) return undefined;
  const videos = (ctx.getDoc().assets ?? []).filter((a) => a.kind === 'video' && a.src);
  if (!videos.length) return undefined;
  const rates = await deps.api.mediaFps(videos.map((a) => a.src)).catch(() => [] as Array<number | null>);
  const want = directorTimelineFps(ctx.getDoc(), state.fps, rates);
  if (!want) return undefined;
  ctx.commands.setProjectFps(want);
  return ctx.getState().fps === want ? `The timeline is now ${want} fps to match the clips (they were shot at ${want}).` : undefined;
}

/** Cells of the reference sheet: one a shot, at most this many. */
const REFERENCE_CELLS = 15;

export async function directorOptions(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const rateNote = await matchFootageRate(ctx, deps);
  const fps = ctx.getState().fps;
  const assets = (ctx.getDoc().assets ?? []).filter((a) => VISUAL.has(a.kind) || a.kind === 'audio');
  // RS-1217: a reference reel is studied, never cast; it leaves the numbered clip list
  const want = typeof args.reference === 'string' ? args.reference.trim().toLowerCase() : '';
  const refAsset = want ? assets.find((a) => a.kind === 'video' && (a.id.toLowerCase() === want || a.name.toLowerCase() === want)) : undefined;
  if (want && !refAsset) return { error: `no imported video ${JSON.stringify(args.reference)} to use as the reference (give its assetId or file name)` };
  updateDirectorSession(projectId(ctx), { reference: refAsset ? { assetId: refAsset.id } : undefined });
  const visual = directorVisuals(ctx);
  // RS-1239: a promo reel's page, read while the clips are watched
  const brandRaw = typeof args.brandUrl === 'string' ? args.brandUrl.trim() : '';
  const brandWork: Promise<BrandKit | { error: string } | undefined> = brandRaw && deps.api.brandKit ? deps.api.brandKit(brandRaw).catch((e: unknown) => ({ error: String((e as Error)?.message ?? e) })) : Promise.resolve(brandRaw ? { error: 'reading a web page is not available here' } : undefined);
  const songs = [...assets.filter((a) => a.kind === 'audio').slice(0, 3), ...libraryMusic(ctx)];
  const beats = new Map(await Promise.all(songs.map(async (a) => [a.id, await tempo(a, deps)] as const)));
  // stage 1: watch the footage, then log it and take the sheet cells at each clip's best moments
  const { features, tags } = await analyseClips(visual, fps, ctx, deps);
  const shape = (a: MediaAsset) => (a.width && a.height ? (a.height > a.width ? 'portrait' : a.height < a.width ? 'landscape' : 'square') : undefined);
  const logClips: ShotLogClip[] = visual.map((a, i) => ({
    n: i + 1, kind: a.kind === 'image' ? 'image' : 'video', seconds: a.durationInFrames / fps,
    ...(shape(a) ? { shape: shape(a) } : {}), features: features.get(a.id) ?? null, ...(tags.get(a.id) ? { tags: tags.get(a.id) } : {}),
  }));
  // RS-1240: the local clock time each video was filmed, from its metadata
  const filmed = filmedLabels(logClips.map((c) => c.features?.captureTimeMs), -new Date().getTimezoneOffset());
  logClips.forEach((c, i) => { if (filmed[i]) c.filmedAt = filmed[i]; });
  const k = sheetSamples(visual.filter((a) => a.kind !== 'image').length, visual.filter((a) => a.kind === 'image').length).length;
  const log = shotLogLines(logClips, fps, k);
  const sheets = await contactSheets(visual, log.moments, ctx, deps);
  const firstSong = assets.find((a) => a.kind === 'audio');
  const sug = firstSong ? (beats.get(firstSong.id) as { bpm?: number; suggest?: { beatsFor18s: number; dropAtBeat?: number } } | undefined) : undefined;
  const reference = refAsset ? await watchReference(refAsset, fps, logClips, sug?.bpm, ctx, deps) : undefined;
  const brandResult = await brandWork;
  const brand = brandResult && !('error' in brandResult) ? brandResult : undefined;
  updateDirectorSession(projectId(ctx), {
    brand,
    fps, clips: logClips, treatment: undefined, lastBuild: undefined, askFirst: args.askFirst === true, gate: undefined, reference: reference ? { assetId: refAsset!.id, profile: reference.profile } : undefined,
    ...(firstSong ? { song: { assetId: firstSong.id, ...(sug?.bpm ? { bpm: sug.bpm } : {}), ...(sug?.suggest ? { beatsFor18s: sug.suggest.beatsFor18s, ...(sug.suggest.dropAtBeat !== undefined ? { dropAtBeat: sug.suggest.dropAtBeat } : {}) } : {}) } } : {}),
  });
  const song = (a: MediaAsset) => ({ assetId: a.id, name: a.name, seconds: secs(a.durationInFrames, fps), ...(beats.get(a.id) ?? {}) });
  adoptCustomGraphics(ctx.getState().items as never);
  const custom = Object.values(CUSTOM_FX).map((d) => d.id).concat(listCustomTransitions().map((t) => t.id), listCustomGraphics().map((g) => g.id));
  // RS-1210: only what is particular to this project. The catalogue (moves, styles, effects, transitions, looks, sounds)
  // is in the reels-director skill; a result over 16k characters would reach an external agent only as an artifact.
  const images = [...(sheets?.images ?? []), ...(reference?.image ? [{ ...reference.image, frame: sheets?.images.length ?? 0 }] : [])];
  return {
    ...(images.length ? { __images: images } : {}),
    clips: log.lines.map((line, i) => line.replace(/^#\d+ /, `#${i + 1} ${visual[i]!.name} `)),
    shotLogNote: '"best @t" = its strongest moments (sharp, lit, a subject, some life), best first; "moving" = where it moves most; "talking" = speech; "soft/dark" = avoid those seconds; "filmed" = the clock time it was shot (true, so a time label may use it). Cast from these with "#n@t".',
    clipRefs: 'In the plan, name a clip by its number: "#7", or "#7@4.5" to start it at 4.5 s of the source.',
    sheetNote: sheets ? sheets.note : 'No contact sheets (frame sharing is off or unavailable): choose from names and seconds, or view_asset_frames for one or two clips.',
    songs: assets.filter((a) => a.kind === 'audio').slice(0, 3).map(song),
    libraryMusic: libraryMusic(ctx).map(song),
    songHint: 'Use each song\'s suggest: musicStart as given, sections adding up to beatsFor18s (more or fewer for a longer or shorter reel), and the peak section starting at dropAtBeat. Its energy line is the song bar by bar: longer shots on the quiet bars, shorter as it builds, the fastest cuts on the loud ones; section changes on a bar line. No other timing arithmetic is needed.',
    ...(custom.length ? { customShaders: custom } : {}),
    ...(reference ? { reference: { measured: reference.line, sheet: reference.image ? `the last image: the reference, one cell a shot (cells "r·seconds")` : 'no sheet of the reference (frames unavailable)', use: 'Study it for its pace, colour, type, composition and motion; write the treatment\'s styleGuide from it. Never copy its subjects, words or logos, and never cast it.' } } : {}),
    ...(brand ? { brand: brandKitText(brand) } : {}),
    ...(brandResult && 'error' in brandResult ? { brandError: `${brandResult.error}. Ask the user for the name, the one action (e.g. "Join on WhatsApp") and the handle, or build from their story.` } : {}),
    timelineIsEmpty: ctx.getState().items.length === 0,
    ...(rateNote ? { frameRate: `${rateNote} Tell the user in your report.` } : {}),
    next: `${args.askFirst === true ? 'The user wants to approve the treatment before anything is built. ' : ''}Stage 2: write the treatment (two concepts, the tone, hero shots, the arc on the song with each part's purpose, the signature, the kit from the menu in the skill${reference ? ', and the styleGuide from the reference' : ''}) and call reels_director_treatment. Do not write the plan yet.`,
  };
}

/** RS-1217: measure the reference with the clip analysis and lay out one cell a shot. */
async function watchReference(asset: MediaAsset, fps: number, footage: ShotLogClip[], bpm: number | undefined, ctx: AgentContext, deps: ReelsDeps) {
  ctx.onToolProgress?.('Watching the reference reel');
  const [features, cuts] = await Promise.all([deps.api.clipFeatures(asset, fps).catch(() => null), deps.api.referenceCuts?.(asset, fps).catch(() => null)]);
  const seconds = asset.durationInFrames / fps;
  // the reference's own cut rule and whole-reel colour, over the clip analysis (tuned for cuts inside raw footage)
  const measured = { ...(features ?? { assetId: asset.id, dHash: '0', windows: [] }), ...(cuts ? { shotBoundariesFrame: cuts.cutsFrame, ...(cuts.color ? { color: cuts.color } : {}) } : {}) };
  const profile = referenceProfile(asset.name, seconds, measured, fps, footage);
  let image: { frame: number; base64: string } | undefined;
  if (deps.api.selectionSheet && framesAllowed(projectId(ctx))) {
    const starts = profile.shotStarts;
    const mids = starts.map((t, i) => Math.round(((t + (starts[i + 1] ?? seconds)) / 2) * 10) / 10);
    const step = Math.max(1, Math.ceil(mids.length / REFERENCE_CELLS));
    const cells = mids.filter((_, i) => i % step === 0).map((t) => ({ asset, atSec: t, label: `r·${t}s` }));
    const made = await deps.api.selectionSheet(cells).catch(() => null);
    if (made?.sheets[0]) image = { frame: 0, base64: made.sheets[0].base64 };
  }
  return { profile, line: `${referenceLine(profile, bpm)}${features || cuts ? '' : ' (the analysis could not read it: pace and colour are guesses; judge from the sheet)'}`, image };
}

/** The pictures the director sees, numbered #1.. in this order (options and build must agree); never the reference reel. */
function directorVisuals(ctx: AgentContext): MediaAsset[] {
  const reference = directorSession(projectId(ctx))?.reference?.assetId;
  return (ctx.getDoc().assets ?? []).filter((a) => VISUAL.has(a.kind) && a.id !== reference).slice(0, 60);
}

/** "#7" / "#7@4.5" → that clip's assetId (keeping the @start); anything else unchanged. */
export function resolveClipRef(ref: string, visual: readonly Pick<MediaAsset, 'id'>[]): string | null {
  const m = /^#(\d+)(@[\d.]+)?$/.exec(ref.trim());
  if (!m) return ref;
  const a = visual[Number(m[1]) - 1];
  return a ? `${a.id}${m[2] ?? ''}` : null;
}

/** What one build left behind, for the build, the critique and the fix to report from. */
export interface BuildOutcome {
  plan: ReelPlan;
  spans: Array<{ from: number; to: number }>;
  seconds: number;
  clipsUsed: number;
  notes: string[];
  added?: MediaAsset;
  findings: ReturnType<typeof reviewDirectorPlan>;
  lint: ReturnType<typeof lintReel>;
  builds: number;
}

/**
 * Validate, build and commit a plan as one undo step; record the build in the director session and save the run on
 * the reel (RS-1222). Shared by reels_director_build and reels_director_fix, which only report differently.
 */
export async function runBuild(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<BuildOutcome | { error: string }> {
  const parsed = parsePlan(args.plan);
  if (!parsed.ok) return { error: `The plan is not valid: ${parsed.errors.join('; ')}` };
  const plan = parsed.plan;
  const id = projectId(ctx);
  const session = restoreDirectorSession(id, ctx.getState().items as never);
  // RS-1219: the treatment's tone sets how things move unless the plan names its own
  if (!plan.tone && session?.treatment) plan.tone = session.treatment.tone;
  // RS-1249: a shot list is built as written
  if (plan.shotList === undefined && session?.treatment?.shotList) plan.shotList = true;
  if (Array.isArray(args.keep)) plan.keep = args.keep as ReelPlan['keep'];
  // catalogue mistakes come back at once, before the clip analysis the build waits on
  // (a custom graphic already on the timeline from an earlier session is picked up again)
  adoptCustomGraphics(ctx.getState().items as never);
  const problems: string[] = [];
  resolvePlanSections(plan, [], problems);
  if (problems.length) return { error: `The plan has problems: ${problems.join('; ')}` };
  // RS-1230: with "show me the plan first", nothing is built until the user has answered the treatment card
  if (session?.askFirst && session.gate === 'waiting') {
    const said = typeof args.approvedBy === 'string' ? args.approvedBy.trim() : '';
    if (!said) return { error: 'The user asked to approve the treatment first. Show them the card from reels_director_treatment and wait for their reply; then build with approvedBy set to their words.' };
    updateDirectorSession(id, { gate: 'approved' });
  }
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
  const unknown = [...named].filter((x) => !assets.some((a) => a.id === x && VISUAL.has(a.kind)));
  if (unknown.length) return { error: `unknown clip assetIds: ${unknown.join(', ')} (use assetIds from reels_director_options media)` };
  // RS-1221: a line about something no clip shows is refused (the agent asks, or leaves that part out and says so)
  const missing = session?.treatment ? missingThings(session.treatment.story, session.clips).map((m) => m.word) : [];
  const faked = [...plan.sections.map((x) => x.text), ...(plan.overlays ?? []).map((o) => o.text)]
    .filter((t): t is string => !!t).filter((t) => missing.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(t)));
  if (faked.length) return { error: `no clip shows what ${faked.map((t) => `"${t}"`).join(', ')} names: ask the user which clip shows it, or leave that line out and say so in your report` };
  const referenceId = session?.reference?.assetId;
  if (referenceId && named.has(referenceId)) return { error: 'the reference reel is not footage: cast the user\'s clips only' };
  const recipe = directorRecipe(plan);
  const values = defaultValues(recipe);
  values.media.clips = assets.filter((a) => VISUAL.has(a.kind) && a.id !== referenceId).map((a) => ({ assetId: a.id, kind: a.kind as 'video' | 'image' }));
  if (plan.music) values.media.music = [{ assetId: plan.music, kind: 'audio' }];
  let out;
  const tagsWarming = warmingTags.get(id);
  if (tagsWarming) { ctx.onToolProgress?.('Reading what the shots show'); await tagsWarming; }
  try {
    out = await runRecipe({ ...deps.api, ...(deps.shotTags ? { shotTags: deps.shotTags(id) } : {}) }, {
      recipe, values, assets, fps: state.fps, replaceTimeline: true, plan,
      ...(typeof args.seed === 'number' && Number.isFinite(args.seed) ? { seed: Math.round(args.seed) } : {}),
      onProgress: ctx.onToolProgress,
    });
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  if (!out.action) return { error: out.messages.join('; ') || 'could not build the plan' };
  out.messages.push(...await finishDirectorActions(out.action.actions, assets, deps.api, state.fps, ctx.onToolProgress));
  const report = out.result.report;
  const fps = state.fps;
  const spans = sectionSpans(out.action.actions, plan.sections.length, fps);
  const songAsset = plan.music ? assets.find((a) => a.id === plan.music) : undefined;
  const song = songAsset ? { seconds: songAsset.durationInFrames / fps, ...(await tempo(songAsset, deps)) } : undefined;
  const grid = songAsset ? await deps.api.musicGrid(songAsset).catch(() => null) : null;
  // RS-1224: the song bar by bar from where the reel starts it, for the pace check
  const startIdx = grid ? grid.beatTimesSec.findIndex((t) => t >= report.musicStartSec - 0.05) : -1;
  const map = grid && startIdx >= 0 ? songMap(grid.energyPerBeat, startIdx, grid.beatsPerBar, Math.ceil(report.totalFrames / fps / (60 / (song?.bpm ?? 120)) / grid.beatsPerBar) + 1) : null;
  const findings = reviewDirectorPlan({
    plan, spans, musicStartSec: report.musicStartSec, ...(song ? { song } : {}), ...(map ? { songMap: map } : {}),
    ...(report.eyeJumps?.length ? { eyeJumps: report.eyeJumps } : {}), ...(report.voices?.length ? { voices: report.voices } : {}),
  });
  // RS-1220: the reel with eyes closed, against the song's beat grid
  const beatFrames = (grid?.beatTimesSec ?? []).map((t) => Math.round((t - report.musicStartSec) * fps)).filter((f) => f >= 0 && f <= report.totalFrames + fps);
  const sound = soundCheck({
    actions: out.action.actions, fps, totalFrames: report.totalFrames, beatFrames,
    ...(grid?.dropSec !== undefined ? { dropFrame: Math.round((grid.dropSec - report.musicStartSec) * fps) } : {}),
  });
  const builds = (session?.lastBuild?.builds ?? 0) + 1;
  const record = {
    plan, spans, builds, clips: report.sectionClips ?? [], moments: report.sectionMoments ?? [], shotSec: report.shotSec ?? [], sound,
    // a fix round is saved with its number and defects (they go with the reel, RS-1222)
    ...(Array.isArray(args.keep) ? { fixes: typeof args.fixRound === 'number' ? args.fixRound : session?.lastBuild?.fixes ?? 0, defects: Array.isArray(args.defects) ? args.defects as Defect[] : session?.lastBuild?.defects ?? [] } : {}),
  };
  const next = updateDirectorSession(id, { fps, lastBuild: record });
  // RS-1222: the run goes with the reel, on its black canvas
  const actions = stampDirector(out.action.actions, savedDirector(next));
  commit(ctx, [...(added ? [{ type: 'addAsset', asset: added } as AtomicAction] : []), ...actions], 'Director: build reel');
  return {
    plan, spans, seconds: secs(report.totalFrames, fps), clipsUsed: report.usedAssetIds.length, notes: out.messages.slice(0, 12),
    ...(added ? { added } : {}), findings, lint: lintReel(ctx.getState()), builds,
  };
}

export async function directorBuild(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const { keep: _internal, ...given } = args;
  const built = await runBuild(given, ctx, deps);
  if ('error' in built) return built;
  const { plan, spans, findings, lint, builds } = built;
  const fps = ctx.getState().fps;
  const session = directorSession(projectId(ctx));
  // RS-1211: the review comes with the build: one frame per section, the lint, and the plan review
  // a frame 45% into each section (its start is often mid-transition or a flash)
  const frames = spans.map((s) => Math.round((s.from + (s.to - s.from) * 0.45) * fps));
  const sheet = framesAllowed(projectId(ctx)) ? await execFramesTool('view_timeline_frames', { frames }, ctx).catch(() => null) as { __images?: unknown[] } | null : null;
  return {
    ...(sheet?.__images ? { __images: sheet.__images } : {}),
    ok: true, ratio: plan.ratio, seconds: built.seconds, sections: plan.sections.length, clipsUsed: built.clipsUsed,
    ...(built.added ? { musicAdded: built.added.name } : {}), notes: built.notes,
    review: {
      frames: sheet?.__images ? spans.map((s, i) => `image ${i + 1}: section ${i} (${plan.sections[i]!.move}) at ${(s.from + (s.to - s.from) * 0.45).toFixed(1)} s`) : 'frames unavailable',
      findings,
      lint: { errors: lint.errors, warnings: lint.warnings, issues: lint.issues.slice(0, 8).map((x) => x.message) },
    },
    // an external agent's build is a draft until review_edit_session applies it; a bare "report" made it skip that
    // RS-1214: a director run's first build goes to the critique stage before any change
    next: (builds === 1 && session?.treatment
      ? 'Stage 4: call reels_director_critique now (it looks closer than these frames). Do not rebuild before it.'
      : session?.treatment
        ? 'Check these frames; for anything still wrong, use reels_director_fix on those sections (the rest stays as it is), otherwise finish.'
      : findings.length || lint.errors
        ? 'Fix the review findings and anything clearly wrong in the frames with ONE rebuild (replaceTimeline true), then finish.'
        : 'Check the frames; if nothing is clearly wrong, finish.')
      + ' To finish: call review_edit_session if you opened an edit session (nothing reaches the timeline until it returns applied), then report to the user in three short lines.'
      + songReportLine(ctx.getState()) + ' Do not call view_timeline_frames or reels_lint separately.',
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
  const findings = checkTreatment(t, {
    clips: session?.clips ?? [], fps: session?.fps ?? ctx.getState().fps, ...(session?.song ? { song: session.song } : {}),
    ...(session?.reference?.profile ? { reference: session.reference.profile } : {}),
    ...(session?.brand ? { brand: { name: session.brand.name, words: brandWords(session.brand), ...(brandAction(session.brand) ? { action: brandAction(session.brand) } : {}) } } : {}),
    ...(session?.clips.some((c) => c.filmedAt) ? { clock: true } : {}),
  });
  const gated = session?.askFirst === true;
  updateDirectorSession(id, { treatment: t, lastBuild: undefined, ...(gated ? { gate: 'waiting' as const } : {}) });
  const count: Record<string, number> = {};
  const ids = treatmentIds(t).filter((x) => {
    const kind = catalogKind(x);
    if (!kind) return false;
    count[kind] = (count[kind] ?? 0) + 1;
    return kind === 'move' || kind === 'look' || count[kind]! <= (SLICE_CAP[kind as keyof typeof SLICE_CAP] ?? 4);
  });
  // RS-1221: what only the user can answer stops the run before the plan
  const questions = findings.flatMap((f) => (f.ask ? [f.ask] : []));
  return {
    ok: true,
    concept: t.concepts[t.chosen]?.name,
    tone: t.tone,
    findings,
    ...(questions.length ? { questions } : {}),
    motion: motionRuleText(t.tone),
    catalog: catalogSlice(ids),
    planBrief: PLAN_BRIEF,
    ...(gated ? { card: treatmentCard(t, session?.song?.bpm) } : {}),
    next: gated
      ? `The user approves before anything is built. ${findings.length ? 'First send a revised treatment that fixes the findings (and asks any questions in the same message). Then show' : 'Show'} the user \`card\` exactly as written and ask "Build it, or change something?"; then stop and wait. When they say go, write the plan and call reels_director_build with approvedBy set to their words. When they ask for changes, send a revised treatment and show its card again.`
      : questions.length
      ? 'Ask the user these questions in one short message and wait for the answer; or, if the reel works without that part, leave its line out and say so in your report. The build refuses a line that names it.'
      : findings.length
        ? 'Fix every finding as you write the plan (no need to send the treatment again unless the concept changes), then call reels_director_build.'
        : 'Write the plan from this treatment and call reels_director_build.',
  };
}
