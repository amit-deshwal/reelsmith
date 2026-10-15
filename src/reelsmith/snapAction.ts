// RS-403: "Snap cuts to beats" as one batch, shared by the track menu and the agent tool.
// Uses the beat grid stored on the music clip; analyses the song once (and stores the grid) when there is none.
import type { AtomicAction } from '../editor/reducerActions';
import type { MediaAsset, TimelineState } from '../editor/types';
import { findMusicItem, planSnapCuts, readBeatGrid, timelineBeatFrames, type BeatGridProp, type SnapPlan } from './beatSnap';
import type { AnalyzeApi } from './runRecipe';

export type SnapOutcome =
  | { ok: true; actions: AtomicAction[]; label: string; moved: number; unchanged: number; skipped: SnapPlan['skipped'] }
  | { ok: false; error: string };

export async function snapTrackToBeats(
  state: TimelineState, assets: readonly MediaAsset[], track: string, every: 1 | 2 | 4,
  api: Pick<AnalyzeApi, 'musicGrid'>, opts: { maxShiftFrames?: number; onProgress?: (note: string) => void } = {},
): Promise<SnapOutcome> {
  const music = findMusicItem(state);
  if (!music) return { ok: false, error: 'no music clip on the timeline' };
  let grid: BeatGridProp | null = readBeatGrid(music);
  const extra: AtomicAction[] = [];
  if (!grid) {
    const asset = assets.find((a) => a.id === music.sourceAssetId) ?? assets.find((a) => a.src === music.src);
    if (!asset) return { ok: false, error: `the music clip "${music.name}" has no media-pool source to analyse` };
    opts.onProgress?.('Finding the beat');
    const g = await api.musicGrid(asset).catch(() => null);
    if (!g || g.beatTimesSec.length < 2) return { ok: false, error: 'could not find a steady beat in the music' };
    grid = { beatTimesSec: g.beatTimesSec, beatsPerBar: g.beatsPerBar, downbeatIndex: g.downbeatIndex };
    extra.push({ type: 'updateProps', id: music.id, patch: { rsBeats: grid } });
  }
  const beats = timelineBeatFrames(music, grid, state.fps, every);
  const plan = planSnapCuts(state, track, beats, { assets, ...(opts.maxShiftFrames ? { maxShiftFrames: opts.maxShiftFrames } : {}) });
  return {
    ok: true, actions: [...extra, ...plan.actions], label: `Snap cuts to beats (every ${every})`,
    moved: plan.moved, unchanged: plan.unchanged, skipped: plan.skipped,
  };
}
