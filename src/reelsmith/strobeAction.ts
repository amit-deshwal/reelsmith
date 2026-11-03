// RS-411: the strobe hook as one editor batch, shared by the agent tool (and later the recipe slots, RS-412).
// The hook goes on its own video track above the reel, so the clips underneath keep their timing.
import type { AtomicAction } from '../editor/reducerActions';
import type { MediaAsset, TimelineState } from '../editor/types';
import { planStrobe, type StrobePlan } from './assembler/strobe';
import type { AssemblyClip } from './assembler/types';
import { findMusicItem, readBeatGrid, timelineBeatFrames } from './beatSnap';

export type StrobeOutcome =
  | { ok: true; actions: AtomicAction[]; label: string; plan: StrobePlan }
  | { ok: false; error: string };

const sectionOf = (i: { props?: unknown }) => (i.props as { rsSection?: string } | undefined)?.rsSection;

/** Pool media as strobe candidates (no analysis: equal scores, whole file available). */
export function poolClips(assets: readonly MediaAsset[], fps: number): AssemblyClip[] {
  return assets.filter((a) => (a.kind === 'video' || a.kind === 'image') && a.src).map((a) => ({
    assetId: a.id, name: a.name, src: a.src!, kind: a.kind as 'video' | 'image',
    durationInFrames: Math.max(1, Math.round(a.durationInFrames ?? fps)), score: 0.5,
  }));
}

export function strobeForTimeline(
  state: TimelineState, assets: readonly MediaAsset[],
  o: { mode: 'opener' | 'closer'; lengthSec?: number; flashSec?: number; accent?: boolean; seed: number },
): StrobeOutcome {
  const music = findMusicItem(state);
  const grid = readBeatGrid(music);
  if (!music || !grid) return { ok: false, error: 'the strobe hook needs music with a beat grid; run reels_snap_cuts_to_beats once, or direct a reel with a song' };
  const bar = Math.max(1, grid.beatsPerBar);
  const frames = timelineBeatFrames(music, grid, state.fps, 1);
  const firstDownbeat = timelineBeatFrames(music, grid, state.fps, bar)[0];
  if (firstDownbeat === undefined) return { ok: false, error: 'the beat grid has no bar line inside the music clip' };
  const beatsSec = frames.filter((f) => f >= firstDownbeat).map((f) => f / state.fps);
  const clips = poolClips(assets, state.fps);
  if (!clips.length) return { ok: false, error: 'no video or photo in the media pool' };
  const tag = o.mode === 'opener' ? 'strobe-open' : 'strobe-close';
  const reelEnd = state.items.filter((i) => i.kind !== 'audio' && sectionOf(i) !== tag).reduce((m, i) => Math.max(m, i.startFrame + i.durationInFrames), 0);
  const trackId = `rs-${tag}-track`;
  const plan = planStrobe({
    mode: o.mode, clips, beatsSec, beatsPerBar: bar, fps: state.fps, anchorFrame: o.mode === 'opener' ? 0 : reelEnd,
    lengthSec: o.lengthSec, flashSec: o.flashSec, accent: o.accent, seed: o.seed, track: trackId,
  });
  if (!plan.actions.length) return { ok: false, error: plan.warnings.join('; ') || 'could not plan the strobe' };
  const old = state.items.filter((i) => sectionOf(i) === tag).map((i): AtomicAction => ({ type: 'remove', id: i.id }));
  const hasTrack = !!state.tracks?.[trackId];
  const create: AtomicAction[] = hasTrack ? [] : [{ type: 'track.create', track: { id: trackId, kind: 'video', name: o.mode === 'opener' ? 'Strobe opener' : 'Strobe closer' } } as AtomicAction];
  return { ok: true, actions: [...old, ...create, ...plan.actions], label: o.mode === 'opener' ? 'Strobe opener' : 'Strobe closer', plan };
}
