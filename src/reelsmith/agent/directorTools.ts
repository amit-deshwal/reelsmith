// Director mode tools (RS-1201): the agent reads the moves catalogue with the project's media in one call, then builds
// the reel from its own plan (sections of moves, clips, lines) in one more, as one undo step.
import { parsePlan } from '../../../shared/reelsmith/directorPlan';
import type { AgentContext } from '../../agent/context';
import type { AtomicAction } from '../../editor/reducerActions';
import type { MediaAsset } from '../../editor/types';
import { REEL_LOOKS } from '../looks';
import { framesAllowed } from '../framePrivacy';
import { runRecipe } from '../runRecipe';
import { defaultValues } from '../setupForm';
import { directorRecipe } from '../director/assembleDirector';
import { MOVES, TEXT_STYLES } from '../director/moves';
import { isClipTextStyle } from '../director/textStyles';
import { DIRECTOR_EFFECTS, DIRECTOR_TRANSITIONS, effectParams } from '../director/catalog';
import { commit, projectId, type ReelsDeps } from './reelsTools';

const VISUAL = new Set(['video', 'image']);
const secs = (frames: number, fps: number) => Math.round((frames / fps) * 10) / 10;

/** The bundled songs, as media assets; added to the project only when a plan uses one. */
function libraryMusic(ctx: AgentContext): MediaAsset[] {
  return (ctx.audio ?? []).filter((t) => t.category === 'music').map((t) => ({ id: t.id, name: t.name, kind: 'audio' as const, src: t.src, durationInFrames: t.durationInFrames }));
}

async function tempo(asset: MediaAsset, deps: ReelsDeps): Promise<{ beat: 'steady' | 'none' | 'unknown'; bpm?: number; firstBeatSec?: number }> {
  try {
    const g = await deps.api.musicGrid(asset);
    if (!g || g.beatTimesSec.length < 2) return { beat: 'none' };
    const gaps = g.beatTimesSec.slice(1).map((t, i) => t - g.beatTimesSec[i]!).filter((x) => x > 0.15 && x < 2).sort((a, b) => a - b);
    return { beat: 'steady', ...(gaps.length ? { bpm: Math.round(60 / gaps[Math.floor(gaps.length / 2)]!) } : {}), firstBeatSec: Math.round((g.beatTimesSec[g.downbeatIndex] ?? 0) * 100) / 100 };
  } catch { return { beat: 'unknown' }; }
}

/** Where a video is sampled for the sheet: four moments, so the agent sees how each clip starts, develops and ends. */
const SAMPLES = [0.1, 0.37, 0.63, 0.9];

/** Numbered contact sheets of every clip in one go (cells "n·seconds"), instead of one frame call per clip. */
async function contactSheets(assets: MediaAsset[], fps: number, ctx: AgentContext, deps: ReelsDeps) {
  if (!assets.length || !deps.api.selectionSheet || !framesAllowed(projectId(ctx))) return null;
  const legend = assets.map((a, i) => ({ n: i + 1, assetId: a.id, name: a.name }));
  const cells = assets.flatMap((a, i) => {
    const sec = a.durationInFrames / fps;
    return a.kind === 'image' ? [{ asset: a, atSec: 0, label: `${i + 1}` }]
      : SAMPLES.map((p) => { const t = Math.round(p * sec * 10) / 10; return { asset: a, atSec: t, label: `${i + 1}·${t}s` }; });
  });
  const made = await deps.api.selectionSheet(cells).catch(() => null);
  if (!made?.sheets.length) return null;
  return {
    images: made.sheets.map((sheet, i) => ({ frame: i, base64: sheet.base64 })),
    legend,
    note: `${made.sheets.length} contact sheet(s), 5 cells per row, left to right then top to bottom. A cell "n·t s" is clip n of sheetLegend at t seconds (videos: 4 cells at 10/37/63/90% of their length; photos: 1 cell). Plan from these; start a clip at a good moment with "assetId@seconds".`,
  };
}

export async function directorOptions(ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const fps = ctx.getState().fps;
  const assets = (ctx.getDoc().assets ?? []).filter((a) => VISUAL.has(a.kind) || a.kind === 'audio');
  const songs = [...assets.filter((a) => a.kind === 'audio').slice(0, 3), ...libraryMusic(ctx)];
  const beats = new Map(await Promise.all(songs.map(async (a) => [a.id, await tempo(a, deps)] as const)));
  const sheets = await contactSheets(assets.filter((a) => VISUAL.has(a.kind)).slice(0, 60), fps, ctx, deps);
  return {
    ...(sheets ? { __images: sheets.images, sheetLegend: sheets.legend, sheetNote: sheets.note } : { sheetNote: 'No contact sheets (frame sharing is off or unavailable): choose from names and seconds, or view_asset_frames for a few clips.' }),
    media: assets.slice(0, 150).map((a) => ({
      assetId: a.id, name: a.name, kind: a.kind, seconds: secs(a.durationInFrames, fps),
      ...(a.width && a.height ? { orientation: a.height > a.width ? 'portrait' : a.height < a.width ? 'landscape' : 'square' } : {}),
      ...(beats.has(a.id) ? beats.get(a.id) : {}),
    })),
    libraryMusic: libraryMusic(ctx).map((a) => ({ assetId: a.id, name: a.name, seconds: secs(a.durationInFrames, fps), ...beats.get(a.id) })),
    timelineIsEmpty: ctx.getState().items.length === 0,
    moves: MOVES.map((m) => ({
      id: m.id, name: m.name, looks: m.looks, use: m.use, clips: m.clips, beats: m.beats,
      params: m.params.map((p) => ({ id: p.id, type: p.type, label: p.label, default: p.default, ...(p.options ? { options: p.options } : {}), ...(p.min !== undefined ? { min: p.min, max: p.max } : {}) })),
    })),
    textStyles: TEXT_STYLES.map((t) => ({
      id: t.id, name: t.name, looks: t.looks, use: t.use, maxChars: t.maxChars, ...(isClipTextStyle(t) ? { inPicture: true } : {}),
      params: t.params.map((p) => ({ id: p.id, type: p.type, default: p.default, ...(p.min !== undefined ? { min: p.min, max: p.max } : {}) })),
    })),
    effects: DIRECTOR_EFFECTS.map((e) => ({ id: e.id.replace('builtin:fx-', ''), group: e.group, looks: e.looks, use: e.use, ...(e.person ? { needsPerson: true } : {}), params: effectParams(e.id).map((p) => ({ id: p.id, default: p.default, ...(p.min !== undefined ? { min: p.min, max: p.max } : {}) })) })),
    transitions: DIRECTOR_TRANSITIONS.map((t) => ({ id: t.id, looks: t.looks, use: t.use })),
    looks: REEL_LOOKS.map((l) => ({ id: l.id, name: l.name, mood: l.mood, looks: l.description })),
    planShape: {
      ratio: '9:16 (default) | 4:5 | 1:1 | 16:9', music: 'song assetId (imported or libraryMusic)', musicStart: "'firstDownbeat' (default) | 'fromStart' | seconds", look: 'optional look id',
      sections: '[{ move, beats, clips?: ["assetId" or "assetId@seconds"...] in the order the move uses them, text?, textStyle?, params? (the move\'s and the text style\'s), transition? (how it comes in from the section before), effects?: [{ id, params? }] (at most 3), look? }] back to back on the beat',
      overlays: '[{ text, style, from, to (section indexes), params? }] for a line across several sections',
    },
    hint: 'A beat is 60/bpm seconds (0.5 s without a song). Fit the sum of beats to the song: seconds left after firstBeatSec x bpm / 60. Name clips for every section that shows your judgement; omitted clips are cast from unused footage.',
  };
}

export async function directorBuild(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const parsed = parsePlan(args.plan);
  if (!parsed.ok) return { error: `The plan is not valid: ${parsed.errors.join('; ')}` };
  const plan = parsed.plan;
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
  const named = new Set(plan.sections.flatMap((s) => s.clips ?? []).map((ref) => ref.split('@')[0]!));
  const unknown = [...named].filter((id) => !assets.some((a) => a.id === id && VISUAL.has(a.kind)));
  if (unknown.length) return { error: `unknown clip assetIds: ${unknown.join(', ')} (use assetIds from reels_director_options media)` };
  const recipe = directorRecipe(plan);
  const values = defaultValues(recipe);
  values.media.clips = assets.filter((a) => VISUAL.has(a.kind)).map((a) => ({ assetId: a.id, kind: a.kind as 'video' | 'image' }));
  if (plan.music) values.media.music = [{ assetId: plan.music, kind: 'audio' }];
  let out;
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
  return {
    ok: true, ratio: plan.ratio, seconds: secs(report.totalFrames, state.fps), sections: plan.sections.length, clipsUsed: report.usedAssetIds.length,
    ...(added ? { musicAdded: added.name } : {}), notes: out.messages,
    next: 'Look at a few frames (view the timeline at each section start), fix the plan if a section looks wrong and build again with replaceTimeline true, then run reels_lint and tell the user what you built in three short lines.',
  };
}
