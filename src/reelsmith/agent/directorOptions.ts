// Director stage 1 (RS-1201, RS-1214): watch the footage. The shot log, contact sheets at each clip's best moments, the
// songs with their timing suggestion, narrations, the brand kit, a reference reel and (RS-1258) the shots for the
// story's things, in one call. Split out of directorTools.ts (the build and the treatment), which re-exports it.
import type { AgentContext } from '../../agent/context';
import type { MediaAsset } from '../../editor/types';
import { framesAllowed } from '../framePrivacy';
import { CUSTOM_FX } from '../../gl/fx/effects';
import { listCustomTransitions } from '../../gl/customTransitions';
import { adoptCustomGraphics, listCustomGraphics } from '../director/customGraphics';
import { projectId, type ReelsDeps } from './reelsTools';
import type { ClipFeatures } from '../assembler/scoring';
import type { ClipShotTags } from '../shotTags';
import { filmedLabels, shotLogLines, type ShotLogClip } from '../director/shotLog';
import { directorSession, updateDirectorSession } from '../director/directorSession';
import { referenceLine, referenceProfile } from '../director/reference';
import { songMap, songMapText } from '../director/songMap';
import { beatThisSongGrid, phraseGrid } from '../director/phraseGrid';
import { beatClock } from '../director/assembleDirector';
import { reelVocalStarts, vocalBeats } from '../director/vocalEntry';
import { songVocalStarts } from './directorVocals';
import { musicAnalysisStatus } from '../../audio/intelligence/jobs';
import { brandKitText, type BrandKit } from '../../../shared/reelsmith/brandKit';
import { directorTimelineFps } from '../director/footageRate';
import { narrationOptions, VOICEOVER_HINT } from './directorVoiceover';
import { CANDIDATE_MAX, leftOutText, pickPool, POOL_MAX } from '../director/pool';
import { cacheable, cachedOptions, optionsKey, pickStage1, rememberOptions } from './directorOptionsCache';
export const VISUAL = new Set(['video', 'image']);
const secs = (frames: number, fps: number) => Math.round((frames / fps) * 10) / 10;

/** The bundled songs, as media assets; added to the project only when a plan uses one. */
export function libraryMusic(ctx: AgentContext): MediaAsset[] {
  return (ctx.audio ?? []).filter((t) => t.category === 'music').map((t) => ({ id: t.id, name: t.name, kind: 'audio' as const, src: t.src, durationInFrames: t.durationInFrames }));
}

/** The song's beat grid as the director sees it: the Beat This analysis when it has run, else the local beat finder. */
export async function songGrid(asset: MediaAsset, deps: ReelsDeps) {
  const status = musicAnalysisStatus(asset.id);
  const modelGrid = status.state === 'ready' ? beatThisSongGrid(status.analysis) : null;
  return modelGrid ? { grid: modelGrid, source: 'beat_this' as const } : { grid: await deps.api.musicGrid(asset), source: 'local' as const };
}

export async function tempo(asset: MediaAsset, deps: ReelsDeps, requestedStartSec?: number): Promise<{ beat: 'steady' | 'none' | 'unknown'; beatSource?: 'beat_this' | 'local'; bpm?: number; firstBeatSec?: number; dropSec?: number; loudestSec?: number }> {
  try {
    const { grid: g, source } = await songGrid(asset, deps);
    if (!g || g.beatTimesSec.length < 2) return { beat: 'none' };
    const gaps = g.beatTimesSec.slice(1).map((t, i) => t - g.beatTimesSec[i]!).filter((x) => x > 0.15 && x < 2).sort((a, b) => a - b);
    const r = (x: number) => Math.round(x * 10) / 10;
    const bpm = gaps.length ? Math.round(60 / gaps[Math.floor(gaps.length / 2)]!) : undefined;
    return {
      beat: 'steady', ...(bpm ? { bpm } : {}), beatSource: source, firstBeatSec: Math.round((g.beatTimesSec[g.downbeatIndex] ?? 0) * 100) / 100,
      ...(g.dropSec ? { dropSec: r(g.dropSec) } : {}), ...(g.loudestStartSec ? { loudestSec: r(g.loudestStartSec) } : {}),
      ...(bpm ? { suggest: songSuggestion(g, bpm, g.durationSec ?? asset.durationInFrames / 30, requestedStartSec, songVocalStarts(asset)) } : {}),
    };
  } catch { return { beat: 'unknown' }; }
}

/**
 * RS-1212: the timing arithmetic done for the agent (it was a large share of its planning time): where to start the
 * song, how many beats make about 18 s, and which beat of the reel the drop lands on.
 */
export function songSuggestion(g: { beatTimesSec: number[]; downbeatIndex: number; dropSec?: number; loudestStartSec?: number; energyPerBeat?: number[]; beatsPerBar?: number }, bpm: number, seconds: number, requestedStartSec?: number, vocalStartsSec: readonly number[] = []) {
  const beats = g.beatTimesSec;
  const first = g.downbeatIndex;
  const nearest = (t: number) => { let k = first; for (let i = first; i < beats.length; i += 1) if (Math.abs(beats[i]! - t) < Math.abs(beats[k]! - t)) k = i; return k; };
  // a short song from its first downbeat; a long one 8 beats before the drop (or at its loudest part) so the reel rises into it
  let startIdx = first;
  if (seconds > 40) {
    if (g.dropSec !== undefined) startIdx = Math.max(first, nearest(g.dropSec) - 8);
    else if (g.loudestStartSec !== undefined) startIdx = nearest(g.loudestStartSec);
  }
  if (requestedStartSec !== undefined && Number.isFinite(requestedStartSec) && requestedStartSec >= 0) startIdx = nearest(requestedStartSec);
  const musicStart = Math.round((beats[startIdx] ?? 0) * 100) / 100;
  const beatsFor18s = Math.max(16, Math.round((18 * bpm) / 60 / 4) * 4);
  const dropAtBeat = g.dropSec !== undefined ? nearest(g.dropSec) - startIdx : undefined;
  // RS-1224: quiet and loud bars over the reel and a little past it, so the pace can follow the song
  const map = songMap(g.energyPerBeat, startIdx, g.beatsPerBar ?? 4, Math.min(16, Math.ceil((beatsFor18s * 1.5) / (g.beatsPerBar ?? 4))));
  const phrases = phraseGrid(beats, first, g.energyPerBeat, startIdx, beatsFor18s, g.beatsPerBar ?? 4);
  // M12: the beats of the reel where the singer starts a phrase (from the song's transcript)
  const clock = beatClock({ beatTimesSec: beats } as never, musicStart);
  const vocals = vocalStartsSec.length ? vocalBeats(reelVocalStarts(vocalStartsSec, musicStart, clock(beatsFor18s * 1.5)), clock, Math.round(beatsFor18s * 1.5)) : [];
  return {
    musicStart, beatsFor18s, ...(dropAtBeat !== undefined && dropAtBeat > 0 && dropAtBeat < beatsFor18s ? { dropAtBeat } : {}),
    ...(map ? { energy: songMapText(map) } : {}),
    ...(phrases ? { phrases } : {}),
    ...(vocals.length ? { vocalsAtBeat: vocals.slice(0, 24) } : {}),
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

/**
 * RS-1270: stage 1 must answer inside the tool call's 180 s. It watches for this long from its start; clips not read
 * by then keep being read (the server caches each one) and the result asks for the same call again.
 */
export const STAGE1_BUDGET = {
  watchMs: 100_000,
  /** after the clips: how long from the start stage 1 still waits for what the shots show (the visual model) */
  tagsMs: 115_000,
  /** the shots for `find`, after the sheets: the visual model loads once more for the phrases */
  findMs: 30_000,
};

export const within = <T>(work: Promise<T>, ms: number): Promise<T | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), Math.max(0, ms)); })]).finally(() => clearTimeout(timer));
};

/** Clips read when stage 1 last answered "still watching", by project: a call that got no further builds from what it has. */
const watchedBefore = new Map<string, number>();

/**
 * The build's clip analysis, awaited for the shot log (RS-1214; it used to only warm in the background while the agent
 * planned blind). Three clips at a time like the build; the server caches them, so a second call and the build reuse them.
 */
async function analyseClips(assets: MediaAsset[], read: (asset: MediaAsset) => Promise<ClipFeatures | null>, label: string, ctx: AgentContext, budgetMs: number, known?: ReadonlyMap<string, ClipFeatures>): Promise<{ features: Map<string, ClipFeatures | null>; finished: boolean }> {
  // RS-1272 (8): clips the project's last stage 1 already read are not read again (the second Goa run of the same 33
  // clips waited 100 s on one clip and answered "32 of 33 clips watched")
  const features = new Map<string, ClipFeatures | null>([...(known ?? [])].filter(([id]) => assets.some((a) => a.id === id)));
  const videos = assets.filter((a) => a.kind === 'video' && !features.has(a.id));
  let next = 0;
  const work = Promise.all(Array.from({ length: Math.min(3, videos.length) }, async () => {
    while (next < videos.length) {
      const a = videos[next++]!;
      features.set(a.id, await read(a).catch(() => null));
      ctx.onToolProgress?.(`${label} (${features.size}/${assets.filter((x) => x.kind === 'video').length})`);
    }
  })).then(() => true);
  const finished = (await within(work, budgetMs)) === true;
  return { features: new Map(features), finished };
}

/** Shot tags being read while the agent plans, by project; the build waits for them instead of loading the model again. */
const warmingTags = new Map<string, Promise<unknown>>();
export const shotTagsWarming = (projectId: string): Promise<unknown> | undefined => warmingTags.get(projectId);

/** The shot tags load the visual model and read every clip (about 10 s); the build waits for the same work. */
function warmShotTags(assets: MediaAsset[], ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const load = deps.shotTags?.(projectId(ctx));
  return load ? warmShotTagsFor(projectId(ctx), assets, load) : Promise.resolve(undefined);
}

/**
 * The same work started from outside a run (RS-1258: the Director tab, while the user writes the story): one reading of
 * the clips per project at a time, which stage 1 and the build then wait on instead of starting their own.
 */
export function warmShotTagsFor(id: string, assets: MediaAsset[], load: (assets: MediaAsset[]) => Promise<unknown>): Promise<unknown> {
  if (!assets.length) return Promise.resolve(undefined);
  const running = warmingTags.get(id);
  if (running) return running;
  const work: Promise<unknown> = load(assets).catch(() => undefined).finally(() => { if (warmingTags.get(id) === work) warmingTags.delete(id); });
  warmingTags.set(id, work);
  return work;
}

/**
 * RS-1250: an empty timeline takes the footage's 60 fps (the note says so). RS-1258: stage 1 only decides the rate and
 * analyses the clips at it; `applyTimelineFps` switches the timeline when the build runs. Stage 1 changes nothing in the
 * draft, so a live change while it watches (an upload finishing, a transcript saved) no longer turns the run stale.
 */
export async function footageRateFor(ctx: Pick<AgentContext, 'getState' | 'getDoc'>, deps: Pick<ReelsDeps, 'api'>): Promise<number | undefined> {
  const state = ctx.getState();
  if (state.fps >= 50 || !deps.api.mediaFps) return undefined;
  const videos = (ctx.getDoc().assets ?? []).filter((a) => a.kind === 'video' && a.src);
  if (!videos.length) return undefined;
  const rates = await deps.api.mediaFps(videos.map((a) => a.src)).catch(() => [] as Array<number | null>);
  return directorTimelineFps(ctx.getDoc(), state.fps, rates) ?? undefined;
}

/** Cells of the reference sheet: one a shot, at most this many. */
const REFERENCE_CELLS = 15;

/**
 * RS-1271 (5): the squad is searched for even when the agent forgets to ask. The Goa run's eight `find` phrases named
 * the car, the sea, the pool and the club and no group of friends, so the mirror selfies and the gang selfie went unused
 * and the "Squad intro" concept was dropped. A search that asks for things gets the group shot added (eight at most).
 */
export const GROUP_QUERY = 'a group of friends posing together for a selfie';
export function withGroupQuery(queries: readonly string[]): string[] {
  if (!queries.length || queries.length >= 8 || queries.some((q) => /\b(group|friends|together|selfie|squad|gang|crew|everyone|all of us)\b/i.test(q))) return [...queries];
  return [...queries, GROUP_QUERY];
}

/** reels_find_shots (directorSearchTool), passed in by the dispatcher so the two modules do not import each other. */
export type FindShots = (args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps) => Promise<unknown>;

export async function directorOptions(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps, search?: FindShots): Promise<unknown> {
  // RS-1273 (3): the same media and arguments as a finished stage 1 of this project: its result again, at once
  const timelineFps = await footageRateFor(ctx, deps);
  const id = projectId(ctx);
  const key = optionsKey({ fps: timelineFps ?? ctx.getState().fps, media: (ctx.getDoc().assets ?? []).filter((a) => VISUAL.has(a.kind) || a.kind === 'audio'), args });
  const hit = cachedOptions(id, key);
  if (hit) {
    updateDirectorSession(id, { ...hit.session, treatment: undefined, lastBuild: undefined, gate: undefined });
    return { ...hit.result, timelineIsEmpty: ctx.getState().items.length === 0, cached: 'Stage 1 of this media, kept from earlier: nothing changed since.' };
  }
  const result = await directorOptionsUncached(args, ctx, deps, timelineFps, search);
  if (cacheable(result)) rememberOptions(id, key, result, pickStage1(directorSession(id)));
  return result;
}

async function directorOptionsUncached(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps, timelineFps: number | undefined, search?: FindShots): Promise<unknown> {
  const rateNote = timelineFps ? `The reel is built at ${timelineFps} fps to match the clips (they were shot at ${timelineFps}).` : undefined;
  const fps = timelineFps ?? ctx.getState().fps;
  const assets = (ctx.getDoc().assets ?? []).filter((a) => VISUAL.has(a.kind) || a.kind === 'audio');
  // RS-1217: a reference reel is studied, never cast; it leaves the numbered clip list
  const want = typeof args.reference === 'string' ? args.reference.trim().toLowerCase() : '';
  const refAsset = want ? assets.find((a) => a.kind === 'video' && (a.id.toLowerCase() === want || a.name.toLowerCase() === want)) : undefined;
  if (want && !refAsset) return { error: `no imported video ${JSON.stringify(args.reference)} to use as the reference (give its assetId or file name)` };
  updateDirectorSession(projectId(ctx), { reference: refAsset ? { assetId: refAsset.id } : undefined });
  const id = projectId(ctx);
  const startedAt = Date.now();
  const leftOf = (budgetMs: number) => budgetMs - (Date.now() - startedAt);
  // RS-1270: every clip is watched (the song is read meanwhile), then the numbered list is chosen from them
  const all = directorCandidates(ctx);
  const candidates = all.slice(0, CANDIDATE_MAX);
  // more clips than the list holds: they are ranked on the server's measurements (seconds a clip); the face and person
  // finding, which runs in the page and is several times slower, is then done for the listed clips only
  const measure = all.length > POOL_MAX ? deps.api.clipMeasure : undefined;
  // RS-1272 (8): what the project's earlier stage 1 read at this rate (the session's shot log) is reused
  const before = directorSession(id);
  const known = new Map((before && before.fps === fps ? before.clips : []).flatMap((c) => (c.features?.assetId ? [[c.features.assetId, c.features] as const] : [])));
  const watch = analyseClips(candidates, (a) => (measure ?? deps.api.clipFeatures)(a, fps), 'Watching the clips', ctx, STAGE1_BUDGET.watchMs, known);
  let tags = new Map<string, ClipShotTags>();
  const tagsWork = warmShotTags(candidates, ctx, deps).then((t) => { if (t instanceof Map) tags = t as Map<string, ClipShotTags>; });
  // RS-1239: a promo reel's page, read while the clips are watched
  const brandRaw = typeof args.brandUrl === 'string' ? args.brandUrl.trim() : '';
  const brandWork: Promise<BrandKit | { error: string } | undefined> = brandRaw && deps.api.brandKit ? deps.api.brandKit(brandRaw).catch((e: unknown) => ({ error: String((e as Error)?.message ?? e) })) : Promise.resolve(brandRaw ? { error: 'reading a web page is not available here' } : undefined);
  // RS-1251: imported files that are mostly speech may be the user's narration: they leave the songs
  const { importedSongs, narrations } = await narrationOptions(assets.filter((a) => a.kind === 'audio').slice(0, 4), deps);
  const songs = [...importedSongs, ...libraryMusic(ctx)];
  const requestedStartSec = typeof args.songFrom === 'number' && Number.isFinite(args.songFrom) && args.songFrom >= 0 ? args.songFrom : undefined;
  const beats = new Map(await Promise.all([...songs, ...narrations.map((n) => n.asset)].map(async (a) => [a.id, await tempo(a, deps, requestedStartSec)] as const)));
  const voiceovers = await Promise.all(narrations.map((n) => n.describe(ctx, deps, fps, (beats.get(n.asset.id) as { bpm?: number } | undefined)?.bpm)));
  // stage 1: watch the footage, then log it and take the sheet cells at each clip's best moments
  const watched = await watch;
  const videoCount = candidates.filter((a) => a.kind === 'video').length;
  const stillWatching = (seen: number, said: string) => {
    if (seen <= (watchedBefore.get(id) ?? -1)) return undefined;
    watchedBefore.set(id, seen);
    return { watching: said, next: 'Call reels_director_options again now with the same arguments: it continues where this stopped. Do not plan yet and do not tell the user anything is wrong.' };
  };
  if (!watched.finished) {
    const wait = stillWatching(watched.features.size, `${watched.features.size} of ${videoCount} clips watched so far; the rest are still being read.`);
    if (wait) return wait;
  }
  // the seconds of a clip are in the project's frames; `fps` may be the rate the reel will be built at (RS-1250)
  const assetFps = ctx.getState().fps;
  const pool = pickPool(candidates.map((a) => ({ id: a.id, kind: a.kind === 'image' ? 'image' as const : 'video' as const, seconds: a.durationInFrames / assetFps, features: watched.features.get(a.id) ?? null })));
  const keep = new Set(pool.keep);
  const visual = candidates.filter((a) => keep.has(a.id));
  let features = watched.features;
  if (measure) {
    const faces = await analyseClips(visual, (a) => deps.api.clipFeatures(a, fps), 'Finding the people in the clips', ctx, leftOf(STAGE1_BUDGET.watchMs), known);
    if (!faces.finished) {
      const listed = visual.filter((a) => a.kind === 'video').length;
      const wait = stillWatching(videoCount + faces.features.size, `All ${videoCount} clips are watched and the best ${visual.length} are chosen; the people in them are found in ${faces.features.size} of ${listed} so far.`);
      if (wait) return wait;
    }
    // a clip whose faces are not found yet keeps its measurements
    features = new Map([...watched.features].map(([assetId, f]) => [assetId, faces.features.get(assetId) ?? f]));
  }
  watchedBefore.delete(id);
  updateDirectorSession(id, { pool: all.length > POOL_MAX ? pool.keep : undefined });
  const leftOut = leftOutText([...pool.left, ...all.slice(CANDIDATE_MAX).map((a) => ({ id: a.id, why: 'weaker' as const }))], all.length, (assetId) => all.find((a) => a.id === assetId)?.name ?? assetId);
  await within(tagsWork, leftOf(STAGE1_BUDGET.tagsMs));
  const shape = (a: MediaAsset) => (a.width && a.height ? (a.height > a.width ? 'portrait' : a.height < a.width ? 'landscape' : 'square') : undefined);
  const logClips: ShotLogClip[] = visual.map((a, i) => ({
    n: i + 1, kind: a.kind === 'image' ? 'image' : 'video', seconds: a.durationInFrames / assetFps,
    ...(shape(a) ? { shape: shape(a) } : {}), features: features.get(a.id) ?? null, ...(tags.get(a.id) ? { tags: tags.get(a.id) } : {}),
  }));
  // RS-1240: the local clock time each video was filmed, from its metadata
  const filmed = filmedLabels(logClips.map((c) => c.features?.captureTimeMs), -new Date().getTimezoneOffset());
  logClips.forEach((c, i) => { if (filmed[i]) c.filmedAt = filmed[i]; });
  const k = sheetSamples(visual.filter((a) => a.kind !== 'image').length, visual.filter((a) => a.kind === 'image').length).length;
  const log = shotLogLines(logClips, fps, k);
  // RS-1258: the shots for the story's things come with stage 1 (reels_find_shots was a model turn of its own), found
  // while the sheets are drawn; the clips were read for the shot tags above, so this only embeds the phrases
  const findQueries = withGroupQuery(Array.isArray(args.find) ? args.find.filter((q): q is string => typeof q === 'string' && !!q.trim()) : []);
  const [sheets, found] = await Promise.all([
    contactSheets(visual, log.moments, ctx, deps),
    findQueries.length && search ? within(search({ queries: findQueries }, ctx, deps).catch(() => null), STAGE1_BUDGET.findMs).then((r) => r ?? { error: 'the visual model is still reading the clips: cast from the log and the sheets, or call reels_find_shots in a minute' }) : Promise.resolve(null),
  ]);
  const firstSong = importedSongs[0];
  const sug = firstSong ? (beats.get(firstSong.id) as { bpm?: number; suggest?: { beatsFor18s: number; dropAtBeat?: number; phrases?: { fourBar?: { reelBeat: number }[] } } } | undefined) : undefined;
  const reference = refAsset ? await watchReference(refAsset, fps, assetFps, logClips, sug?.bpm, ctx, deps) : undefined;
  const brandResult = await brandWork;
  const brand = brandResult && !('error' in brandResult) ? brandResult : undefined;
  updateDirectorSession(projectId(ctx), {
    brand, timelineFps,
    fps, clips: logClips, treatment: undefined, lastBuild: undefined, askFirst: args.askFirst === true, gate: undefined, reference: reference ? { assetId: refAsset!.id, profile: reference.profile } : undefined,
    ...(firstSong ? { song: { assetId: firstSong.id, ...(sug?.bpm ? { bpm: sug.bpm } : {}), ...(sug?.suggest ? { beatsFor18s: sug.suggest.beatsFor18s, ...(sug.suggest.dropAtBeat !== undefined ? { dropAtBeat: sug.suggest.dropAtBeat } : {}), ...(sug.suggest.phrases?.fourBar?.length ? { phraseBeats: sug.suggest.phrases.fourBar.map((p) => p.reelBeat) } : {}) } : {}) } } : {}),
  });
  const song = (a: MediaAsset) => ({ assetId: a.id, name: a.name, seconds: secs(a.durationInFrames, assetFps), ...(beats.get(a.id) ?? {}) });
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
    ...(leftOut ? { leftOut } : {}),
    ...(tags.size ? {} : { tagsNote: 'What each clip shows is not in the log (the visual model is not installed, or is still reading): judge the subjects from the contact sheets.' }),
    sheetNote: sheets ? sheets.note : 'No contact sheets (frame sharing is off or unavailable): choose from names and seconds, or view_asset_frames for one or two clips.',
    ...(voiceovers.length ? {
      voiceovers,
      voiceoverHint: VOICEOVER_HINT,
    } : {}),
    // RS-1258: what `find` asked for, as ready "#n@s" refs (or why the search could not run)
    ...(findQueries.length ? { shots: found && typeof found === 'object' && 'results' in found ? found : { unavailable: (found as { error?: string } | null)?.error ?? 'the visual model is not available: cast from the log and the sheets' } } : {}),
    songs: importedSongs.map(song),
    libraryMusic: libraryMusic(ctx).map(song),
    songHint: 'Use each song\'s suggest: musicStart as given (it follows songFrom, snapped to a beat); sections adding up to beatsFor18s (adjust for their length), and the peak at dropAtBeat. Phrases give 4-bar and 8-bar boundaries from musicStart; for any other start, use songFourBarSec. energyByBeat is 1 quiet to 5 loud from musicStart. Place scene, title and drop changes on phrase boundaries where the story and song allow. vocalsAtBeat: beats where the singer starts a phrase; a line\'s section starting there (or a beat or two before: the line waits for the voice) lands its words with the singer.',
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
async function watchReference(asset: MediaAsset, fps: number, assetFps: number, footage: ShotLogClip[], bpm: number | undefined, ctx: AgentContext, deps: ReelsDeps) {
  ctx.onToolProgress?.('Watching the reference reel');
  const [features, cuts] = await Promise.all([deps.api.clipFeatures(asset, fps).catch(() => null), deps.api.referenceCuts?.(asset, fps).catch(() => null)]);
  const seconds = asset.durationInFrames / assetFps;
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

/** Every picture the director may choose its list from: not the reference reel, not a file still uploading. */
export function directorCandidates(ctx: AgentContext): MediaAsset[] {
  const reference = directorSession(projectId(ctx))?.reference?.assetId;
  return (ctx.getDoc().assets ?? []).filter((a) => VISUAL.has(a.kind) && a.id !== reference);
}

/**
 * The pictures the director sees, numbered #1.. in this order (options and build must agree); never the reference reel.
 * RS-1270: with more than 60 clips, the list stage 1 chose (it goes with the reel); the first 60 before a stage 1.
 */
export function directorVisuals(ctx: AgentContext): MediaAsset[] {
  const all = directorCandidates(ctx);
  const pool = directorSession(projectId(ctx))?.pool;
  if (pool?.length) {
    const byId = new Map(all.map((a) => [a.id, a]));
    const listed = pool.flatMap((assetId) => { const a = byId.get(assetId); return a ? [a] : []; });
    if (listed.length) return listed;
  }
  return all.slice(0, POOL_MAX);
}
