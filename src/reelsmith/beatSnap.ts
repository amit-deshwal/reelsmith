// RS-403: snap cuts to the music's beat grid.
// The grid is stored on the music clip as props.rsBeats (written when a recipe assembles, or by the
// snap tool after analysing a song). Beat times are in SOURCE seconds; they are mapped through the
// clip's trim and speed to timeline frames here.
import type { AtomicAction } from '../editor/reducerActions';
import type { MediaAsset, TimelineItem, TimelineState } from '../editor/types';

export interface BeatGridProp {
  beatTimesSec: number[];
  beatsPerBar: number;
  /** index in beatTimesSec of the first downbeat */
  downbeatIndex: number;
}

export function readBeatGrid(item: TimelineItem | undefined): BeatGridProp | null {
  const g = (item?.props as { rsBeats?: BeatGridProp } | undefined)?.rsBeats;
  return g && Array.isArray(g.beatTimesSec) && g.beatTimesSec.length > 1 ? g : null;
}

/** The music clip: an audio item carrying a beat grid, else the longest audio item. */
export function findMusicItem(state: TimelineState): TimelineItem | undefined {
  const audio = state.items.filter((i) => i.kind === 'audio');
  return audio.find((i) => readBeatGrid(i)) ?? [...audio].sort((a, b) => b.durationInFrames - a.durationInFrames)[0];
}

/**
 * Timeline frames of every `every`-th beat that falls inside the music clip.
 * every = 1 (each beat), 2, or 4; counting starts at the first downbeat so 4 lands on bars in 4/4.
 */
export function timelineBeatFrames(music: Pick<TimelineItem, 'startFrame' | 'durationInFrames' | 'srcInFrame' | 'playbackRate'>, grid: BeatGridProp, fps: number, every = 1): number[] {
  const rate = Math.max(0.01, music.playbackRate ?? 1);
  const srcIn = music.srcInFrame ?? 0;
  const out: number[] = [];
  const step = Math.max(1, Math.round(every));
  grid.beatTimesSec.forEach((sec, i) => {
    const k = i - grid.downbeatIndex;
    if (((k % step) + step) % step !== 0) return;
    const f = Math.round(music.startFrame + (sec * fps - srcIn) / rate);
    if (f >= music.startFrame && f <= music.startFrame + music.durationInFrames) out.push(f);
  });
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Nearest frame in sorted `grid` inside [lo, hi], or null. */
function nearestIn(grid: number[], target: number, lo: number, hi: number): number | null {
  let best: number | null = null;
  for (const f of grid) {
    if (f < lo || f > hi) continue;
    if (best === null || Math.abs(f - target) < Math.abs(best - target)) best = f;
  }
  return best;
}

export interface SnapPlan {
  actions: AtomicAction[];
  moved: number;
  unchanged: number;
  skipped: Array<{ itemId: string; reason: string }>;
}

/**
 * Move every cut on `track` to the nearest grid frame. Clips that touch keep touching (the cut moves for
 * both sides); a clip never gets shorter than `minFrames`, and a video clip is never stretched past the
 * end of its source. The first clip's start stays where it is.
 */
export function planSnapCuts(
  state: TimelineState, track: string, grid: number[], opts: { minFrames?: number; maxShiftFrames?: number; assets?: readonly MediaAsset[] } = {},
): SnapPlan {
  const minF = Math.max(1, opts.minFrames ?? Math.round(state.fps * 0.3));
  const maxShift = opts.maxShiftFrames ?? Math.round(state.fps * 1.0);
  const clips = state.items.filter((i) => i.track === track && i.kind !== 'audio').sort((a, b) => a.startFrame - b.startFrame);
  const skipped: SnapPlan['skipped'] = [];
  if (clips.length === 0 || grid.length === 0) return { actions: [], moved: 0, unchanged: 0, skipped };

  const sourceRoom = (c: TimelineItem): number => {
    if (c.kind !== 'video') return Infinity;
    const asset = opts.assets?.find((a) => a.id === c.sourceAssetId) ?? opts.assets?.find((a) => a.src === c.src);
    if (!asset) return Infinity;
    return (asset.durationInFrames - (c.srcInFrame ?? 0)) / Math.max(0.01, c.playbackRate ?? 1);
  };

  // new [start, end) per clip, plus srcIn shift for a clip whose start moved
  const next = clips.map((c) => ({ id: c.id, start: c.startFrame, end: c.startFrame + c.durationInFrames, srcIn: c.srcInFrame ?? 0 }));
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i]!;
    const n = next[i]!;
    const following = clips[i + 1];
    const touches = following && following.startFrame === c.startFrame + c.durationInFrames;
    // latest this cut may move to: keep the next clip ≥ minF and this clip within its source
    const hiSelf = n.start + Math.min(sourceRoom({ ...c, srcInFrame: n.srcIn } as TimelineItem), Number.MAX_SAFE_INTEGER);
    const hiNext = touches ? following.startFrame + following.durationInFrames - minF : (following ? following.startFrame : Infinity);
    const lo = n.start + minF;
    const hi = Math.min(hiSelf, hiNext, n.end + maxShift);
    const target = nearestIn(grid, n.end, Math.max(lo, n.end - maxShift), hi);
    if (target === null) { skipped.push({ itemId: c.id, reason: 'no beat within reach' }); continue; }
    const shift = target - n.end;
    n.end = target;
    if (touches && shift !== 0) {
      const f = next[i + 1]!;
      // the next clip starts later/earlier: trim its head (and its source in-point) by the same amount
      const nextRate = Math.max(0.01, following.playbackRate ?? 1);
      const newSrcIn = f.srcIn + shift * nextRate;
      if (following.kind === 'video' && newSrcIn < 0) {
        n.end -= shift; // cannot pull the next clip's head earlier than its source start
        skipped.push({ itemId: following.id, reason: 'source has no earlier frames' });
        continue;
      }
      f.start = target;
      f.srcIn = following.kind === 'video' ? Math.round(newSrcIn) : f.srcIn;
    }
  }
  // Two passes keep every intermediate state overlap-free: first shrink each clip to the part of its
  // old span it keeps, then grow each to its final span (finals never overlap each other).
  const shrink: AtomicAction[] = [];
  const grow: AtomicAction[] = [];
  let moved = 0;
  clips.forEach((c, i) => {
    const n = next[i]!;
    const oldEnd = c.startFrame + c.durationInFrames;
    if (n.start === c.startFrame && n.end === oldEnd) return;
    moved++;
    const rate = Math.max(0.01, c.playbackRate ?? 1);
    const srcAt = (start: number) => (c.kind === 'video' ? { srcInFrame: Math.round((c.srcInFrame ?? 0) + (start - c.startFrame) * rate) } : {});
    const s0 = Math.max(c.startFrame, n.start);
    const e0 = Math.min(oldEnd, n.end);
    if ((s0 !== c.startFrame || e0 !== oldEnd) && e0 - s0 >= 1) {
      shrink.push({ type: 'retime', id: c.id, startFrame: s0, durationInFrames: e0 - s0, ...(s0 !== c.startFrame ? srcAt(s0) : {}) });
    }
    if (s0 !== n.start || e0 !== n.end) {
      grow.push({ type: 'retime', id: c.id, startFrame: n.start, durationInFrames: n.end - n.start, ...(n.start !== c.startFrame ? srcAt(n.start) : {}) });
    }
  });
  const actions = [...shrink, ...grow];
  return { actions, moved, unchanged: clips.length - moved, skipped };
}
