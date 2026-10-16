// RS-411: strobe flash-cut hook (opener) and the same pattern as a closer. A few very short shots cut on the
// beat grid, each from a different part of the footage, with an optional white Flash transition between them.
// Pure planner: recipes (RS-412) and agent tools place the returned actions.
import type { AtomicAction } from '../../editor/reducerActions';
import { clipItem } from './common';
import { pickClips } from './beatMontage';
import { stableId } from './rng';
import type { AssemblyClip } from './types';

export const STROBE_DEFAULTS = { lengthSec: 1.5, flashSec: 0.5, accent: true, clipGainDb: -96 } as const;
export const FLASH_MIN_SEC = 0.3;
export const FLASH_MAX_SEC = 0.6;

export interface StrobeOptions {
  mode: 'opener' | 'closer';
  clips: AssemblyClip[];
  /** Beat times in timeline seconds, ascending; the first beat is a downbeat (bars are `beatsPerBar` beats). */
  beatsSec: number[];
  beatsPerBar: number;
  fps: number;
  /** opener: starts on the first grid point at or after this frame; closer: ends on the last bar line at or before it */
  anchorFrame: number;
  /** total length of the hook, seconds (default 1.5) */
  lengthSec?: number;
  /** length of one flash, seconds; clamped to 0.3-0.6 (default 0.5) */
  flashSec?: number;
  /** white Flash transition between shots (default true) */
  accent?: boolean;
  /** dB applied to the shots' own sound (default silent: the song carries the hook) */
  clipGainDb?: number;
  track?: string;
  seed: number;
  /** 0..1, how much randomness may override the clip score */
  variety?: number;
}

export interface StrobeShot { startFrame: number; durationInFrames: number; assetId: string; srcInFrame: number }
export interface StrobePlan { actions: AtomicAction[]; shots: StrobeShot[]; startFrame: number; endFrame: number; warnings: string[] }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

/** Beats subdivided into `k` equal steps. */
function subdivide(beats: number[], k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < beats.length; i += 1) {
    const next = beats[i + 1] ?? beats[i]! + (beats[i]! - (beats[i - 1] ?? beats[i]! - 0.5));
    for (let j = 0; j < k; j += 1) out.push(beats[i]! + ((next - beats[i]!) * j) / k);
  }
  return out;
}

export function planStrobe(o: StrobeOptions): StrobePlan {
  const warnings: string[] = [];
  const empty = (msg: string): StrobePlan => ({ actions: [], shots: [], startFrame: o.anchorFrame, endFrame: o.anchorFrame, warnings: [...warnings, msg] });
  if (o.beatsSec.length < 2) return empty('strobe needs a beat grid');
  const flashSec = Math.min(FLASH_MAX_SEC, Math.max(FLASH_MIN_SEC, o.flashSec ?? STROBE_DEFAULTS.flashSec));
  const lengthSec = Math.max(flashSec, o.lengthSec ?? STROBE_DEFAULTS.lengthSec);
  const beatSec = median(o.beatsSec.slice(1).map((b, i) => b - o.beatsSec[i]!));
  const k = ([1, 2, 4].find((d) => beatSec / d <= FLASH_MAX_SEC) ?? 4);
  const unitSec = beatSec / k;
  const unitsPerFlash = Math.max(1, Math.round(flashSec / unitSec));
  const count = Math.max(1, Math.round(lengthSec / (unitsPerFlash * unitSec)));
  const grid = subdivide(o.beatsSec, k);
  const frameAt = (sec: number) => Math.round(sec * o.fps);
  const span = count * unitsPerFlash;

  let first: number;
  if (o.mode === 'opener') {
    first = grid.findIndex((t) => frameAt(t) >= o.anchorFrame);
    if (first < 0 || first + span >= grid.length) return empty('the beat grid is too short for the opener');
  } else {
    // end on a bar line (every beatsPerBar*k grid steps) at or before the anchor
    const barSteps = Math.max(1, o.beatsPerBar) * k;
    let end = -1;
    for (let i = grid.length - 1; i >= 0; i -= 1) if (i % barSteps === 0 && frameAt(grid[i]!) <= o.anchorFrame) { end = i; break; }
    if (end - span < 0) return empty('the beat grid is too short for the closer');
    first = end - span;
  }
  const bounds = Array.from({ length: count + 1 }, (_, i) => frameAt(grid[first + i * unitsPerFlash]!));

  // Sources: best clips first, each shot from a different part of the footage.
  const lens = bounds.slice(1).map((b, i) => Math.max(1, b - bounds[i]!));
  const ranked = pickClips(o.clips, o.clips.length, false, o.seed, o.variety ?? 0);
  const used = new Map<string, Array<[number, number]>>();
  const gap = Math.round(0.5 * o.fps);
  const free = (id: string, from: number, to: number) => (used.get(id) ?? []).every(([a, b]) => to + gap <= a || from >= b + gap);
  const shots: StrobeShot[] = [];
  const chosen: Array<{ clip: AssemblyClip; srcInFrame: number }> = [];
  for (let s = 0; s < count; s += 1) {
    const len = lens[s]!;
    let hit: { clip: AssemblyClip; srcInFrame: number } | undefined;
    // pass 1 prefers clips not used yet; pass 2 re-uses a clip from a different, non-overlapping range
    for (const pass of [0, 1]) {
      for (const clip of ranked) {
        if (hit) break;
        if ((used.get(clip.assetId)?.length ?? 0) > 0 !== (pass === 1)) continue;
        if (clip.kind === 'image') { if (pass === 0) hit = { clip, srcInFrame: 0 }; continue; }
        const last = clip.durationInFrames - len;
        if (last < 0) continue;
        const start0 = Math.min(Math.max(0, clip.bestStartFrame ?? 0), last);
        const tries = [start0, ...[0.25, 0.5, 0.75, 1].map((f) => Math.round(last * f)), 0];
        const at = tries.find((t) => free(clip.assetId, t, t + len));
        if (at !== undefined) hit = { clip, srcInFrame: at };
      }
      if (hit) break;
    }
    if (!hit) { warnings.push(`only ${s} of ${count} flashes could use different footage; add more clips`); break; }
    used.set(hit.clip.assetId, [...(used.get(hit.clip.assetId) ?? []), [hit.srcInFrame, hit.srcInFrame + len]]);
    chosen.push(hit);
  }
  if (!chosen.length) return empty('no usable clips for the strobe');

  const track = o.track ?? 'V1';
  const tag = o.mode === 'opener' ? 'strobe-open' : 'strobe-close';
  const actions: AtomicAction[] = [];
  const ids: string[] = [];
  chosen.forEach((c, i) => {
    const id = stableId('rs', tag, o.seed, i);
    ids.push(id);
    const act = clipItem(id, c.clip, track, lens[i]!, { props: { rsSection: tag } }, o.clipGainDb ?? STROBE_DEFAULTS.clipGainDb);
    const item = (act as { item: { srcInFrame?: number; playbackRate?: number } }).item;
    if (c.clip.kind === 'video') { item.srcInFrame = c.srcInFrame; item.playbackRate = undefined; }
    (act as { startFrame: number }).startFrame = bounds[i]!;
    actions.push(act);
    shots.push({ startFrame: bounds[i]!, durationInFrames: lens[i]!, assetId: c.clip.assetId, srcInFrame: c.srcInFrame });
  });
  if (o.accent ?? STROBE_DEFAULTS.accent) {
    for (let i = 1; i < ids.length; i += 1) {
      const maxL = Math.min(lens[i - 1]!, lens[i]!);
      const durationInFrames = Math.max(2, Math.min(Math.round(0.15 * o.fps), maxL));
      actions.push({ type: 'addTransition', id: stableId('rs-tr', tag, o.seed, i), incomingItemId: ids[i]!, transType: 'flash', durationInFrames });
    }
  }
  return { actions, shots, startFrame: bounds[0]!, endFrame: bounds[shots.length]!, warnings };
}
