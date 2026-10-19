// RS-1209: time an effect to the song on an existing reel ("make the glitch hit on the beat", "blur only the background",
// "shake into the drop"). The agent names the effect, the clips (or a stretch of seconds) and a timing; this works out the
// envelope of every clip from the song's beat grid with the director's own rules, as one undo step. Without it the agent
// would have to compute beat times in each clip's own seconds by hand.
import type { AtomicAction } from '../../editor/reducerActions';
import type { ClipEffect, MediaAsset, TimelineItem, TimelineState } from '../../editor/types';
import { ALL_FX, serializableDefsFor } from '../../gl/fx/effects';
import { EFFECT_TIMINGS, type EffectTiming, type PlanEffect } from '../../../shared/reelsmith/directorPlan';
import { effectMixFor } from '../director/effectTiming';
import { findMusicItem, readBeatGrid, timelineBeatFrames, type BeatGridProp } from '../beatSnap';
import type { AnalyzeApi } from '../runRecipe';

export interface TimeEffectArgs {
  effect: string;
  timing: EffectTiming;
  every?: number;
  strength?: number;
  region?: 'all' | 'subject' | 'background';
  params?: Record<string, number>;
  itemIds?: string[];
  fromSec?: number;
  toSec?: number;
}

type Outcome = { ok: true; actions: AtomicAction[]; label: string; clips: number; beats: number } | { ok: false; error: string };

const assetOf = (id: string) => (id in ALL_FX ? id : `builtin:fx-${id}` in ALL_FX ? `builtin:fx-${id}` : undefined);

export function parseTimeEffectArgs(raw: Record<string, unknown>): TimeEffectArgs | { error: string } {
  const effect = typeof raw.effect === 'string' ? raw.effect.trim() : '';
  if (!effect || !assetOf(effect)) return { error: `unknown effect "${effect}" (use an effect id from browse_library category=fx, e.g. "glitch" or "builtin:fx-glitch")` };
  const timing = (raw.timing ?? 'beat') as EffectTiming;
  if (!EFFECT_TIMINGS.includes(timing)) return { error: `timing must be one of ${EFFECT_TIMINGS.join(', ')}` };
  const n = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
  if (raw.every !== undefined && n(raw.every, 0.25, 16) === undefined) return { error: 'every must be 0.25 to 16 beats' };
  if (raw.strength !== undefined && n(raw.strength, 0, 1) === undefined) return { error: 'strength must be 0 to 1' };
  if (raw.region !== undefined && raw.region !== 'all' && raw.region !== 'subject' && raw.region !== 'background') return { error: 'region must be all, subject or background' };
  const params: Record<string, number> = {};
  if (raw.params && typeof raw.params === 'object') for (const [k, v] of Object.entries(raw.params as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
  return {
    effect: assetOf(effect)!, timing,
    ...(raw.every !== undefined ? { every: raw.every as number } : {}), ...(raw.strength !== undefined ? { strength: raw.strength as number } : {}),
    ...(raw.region ? { region: raw.region as TimeEffectArgs['region'] } : {}), ...(Object.keys(params).length ? { params } : {}),
    ...(Array.isArray(raw.itemIds) ? { itemIds: raw.itemIds.filter((x): x is string => typeof x === 'string') } : {}),
    ...(n(raw.fromSec, 0, 36000) !== undefined ? { fromSec: raw.fromSec as number } : {}), ...(n(raw.toSec, 0, 36000) !== undefined ? { toSec: raw.toSec as number } : {}),
  };
}

/** The clips to time: the named ones, else picture clips overlapping fromSec..toSec, else the selection. */
function targets(state: TimelineState, a: TimeEffectArgs): TimelineItem[] {
  const picture = state.items.filter((i) => i.kind === 'video' || i.kind === 'image');
  if (a.itemIds?.length) return picture.filter((i) => a.itemIds!.some((id) => i.id === id || i.id.startsWith(id)));
  if (a.fromSec !== undefined || a.toSec !== undefined) {
    const from = Math.round((a.fromSec ?? 0) * state.fps), to = Math.round((a.toSec ?? Infinity) * state.fps);
    // skip cut-out copies (they ride on the clip under them) so a look is not doubled
    return picture.filter((i) => i.startFrame < to && i.startFrame + i.durationInFrames > from && !(i.effects ?? []).some((e) => e.assetId === 'builtin:fx-person-cutout'));
  }
  const sel = new Set(state.selectedIds ?? (state.selectedId ? [state.selectedId] : []));
  return picture.filter((i) => sel.has(i.id));
}

export async function planTimedEffect(state: TimelineState, assets: readonly MediaAsset[], a: TimeEffectArgs, api: Pick<AnalyzeApi, 'musicGrid'>): Promise<Outcome> {
  const clips = targets(state, a);
  if (!clips.length) return { ok: false, error: 'no picture clips to time: pass itemIds, or fromSec/toSec, or select clips first' };
  const extra: AtomicAction[] = [];
  // the beat grid on the song, analysed once if the timeline has none yet (as snap-to-beats does)
  const music = findMusicItem(state);
  let grid: BeatGridProp | null = readBeatGrid(music);
  if (!grid && music && (a.timing === 'beat' || a.timing === 'drop' || a.timing === 'build')) {
    const asset = assets.find((x) => x.id === music.sourceAssetId) ?? assets.find((x) => x.src === music.src);
    const g = asset ? await api.musicGrid(asset).catch(() => null) : null;
    if (g && g.beatTimesSec.length > 1) { grid = { beatTimesSec: g.beatTimesSec, beatsPerBar: g.beatsPerBar, downbeatIndex: g.downbeatIndex }; extra.push({ type: 'updateProps', id: music.id, patch: { rsBeats: grid } }); }
  }
  if (a.timing === 'beat' && !grid) return { ok: false, error: 'timing "beat" needs a song with a steady beat on the timeline; use fade, build or steady instead' };
  const fps = state.fps;
  const beatFrames = music && grid ? timelineBeatFrames(music, grid, fps, 1) : [];
  const half = Math.round(fps * 0.5);
  // the span the timing covers: the asked seconds, else from the first clip to the last
  const spanStart = a.fromSec !== undefined ? Math.round(a.fromSec * fps) : Math.min(...clips.map((c) => c.startFrame));
  const spanEnd = a.toSec !== undefined ? Math.round(a.toSec * fps) : Math.max(...clips.map((c) => c.startFrame + c.durationInFrames));
  // beat b counted from the span start: the grid's beats from there, 0.5 s a beat past it or without a song
  const local = beatFrames.filter((f) => f >= spanStart - 1);
  const grid0 = local.length && local[0]! - spanStart > 1 ? [spanStart, ...local] : local.length ? local : [spanStart];
  const beatAt = (b: number) => {
    const i = Math.floor(b);
    const at = (k: number) => (k < grid0.length ? grid0[k]! : grid0[grid0.length - 1]! + (k - grid0.length + 1) * (grid0.length > 1 ? grid0[grid0.length - 1]! - grid0[grid0.length - 2]! : half));
    return Math.round(at(i) + (b - i) * (at(i + 1) - at(i)));
  };
  let beats = 0;
  while (beatAt(beats + 1) <= spanEnd && beats < 2000) beats += 1;
  const clock = { fps, start: spanStart, end: spanEnd, beats: Math.max(1, beats), beatAt };
  const plan: PlanEffect = { id: a.effect, timing: a.timing, ...(a.every ? { every: a.every } : {}), ...(a.strength !== undefined ? { strength: a.strength } : {}), ...(a.region ? { region: a.region } : {}) };
  const actions: AtomicAction[] = [...extra];
  for (const clip of clips) {
    const mix = effectMixFor(plan, clock, clip.startFrame, clip.durationInFrames);
    const existing = (clip.effects ?? []).find((e) => e.assetId === a.effect);
    const next: ClipEffect = { id: existing?.id ?? `fx_${clip.id}_${a.effect.replace(/\W+/g, '_')}`, assetId: a.effect, overrides: { ...(existing?.overrides ?? {}), ...(a.params ?? {}) }, ...(mix ? { mix } : {}) };
    const effects = existing ? (clip.effects ?? []).map((e) => (e === existing ? next : e)) : [...(clip.effects ?? []), next];
    actions.push({ type: 'setEffects', id: clip.id, effects, defs: serializableDefsFor([next]) } as AtomicAction);
  }
  const name = ALL_FX[a.effect]?.name ?? a.effect;
  return { ok: true, actions, label: `Time ${name} (${a.timing})`, clips: clips.length, beats };
}
