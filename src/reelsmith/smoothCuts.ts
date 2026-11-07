// RS-1259 follow-up: smooth cuts (DaVinci's Smooth Cut). Cutting ums, pauses and retakes out of a talking clip
// (reels_clean_speech) leaves jump cuts: two pieces of one clip back to back, the second starting later in the source,
// and the head jumps between them. Over each jump a few frames that morph from the last frame before the overlay to the
// first one after it (made by the local server: server/reelsmith/smoothCut.ts) are laid on a track just above, muted,
// with the piece's own look; the pieces, their sound and their captions stay exactly as they were.
import { createMediaSourceRevision } from '../editor/mediaSourceRevision';
import type { AtomicAction } from '../editor/reducerActions';
import { timelineTrackIds, trackKind } from '../editor/timelineTypes';
import type { TimelineItem, TimelineState, TrackId } from '../editor/types';
import type { AnalyzeApi } from './runRecipe';

export const SMOOTH_CUT_TRACK: TrackId = 'rs-smooth-cut-track';
/** Longest jump (seconds of source) bridged; the server refuses longer ones too. */
export const MAX_JUMP_SEC = 3;

/** Frames of the overlay either side of the cut: about 1/15 s (2 at 30 fps), so the morph takes about 0.13 s. */
export const cutHalf = (fps: number) => Math.max(1, Math.round(fps / 15));

export interface JumpCut {
  a: TimelineItem; b: TimelineItem;
  /** the timeline frame where b starts */
  cutFrame: number;
  half: number;
  /** source seconds of the frames just outside the overlay: the last one shown before it and the first after */
  fromSec: number; toSec: number;
}

const rate = (i: TimelineItem) => i.playbackRate ?? 1;
/** What decides how a piece looks on screen; two pieces of one cut clip share all of it. */
const look = (i: TimelineItem) => JSON.stringify([i.transform, i.filters, i.effects, i.zoom, i.backgroundFill, i.backgroundFillStrength, i.width, i.height, i.props ?? {}]);

/**
 * The jump cuts among `items`: on one track, a video piece followed straight away by a later piece of the same file,
 * both at normal speed, with the same look, no keyframes and no transition between them, long enough to give up `half`
 * frames each, and a jump of at most MAX_JUMP_SEC. `only`: just cuts that touch these items.
 */
export function findJumpCuts(state: Pick<TimelineState, 'items' | 'fps' | 'transitions'>, only?: ReadonlySet<string>): JumpCut[] {
  const fps = state.fps;
  const half = cutHalf(fps);
  const joined = new Set((state.transitions ?? []).filter((t) => t.enabled !== false).map((t) => `${t.outgoingItemId}>${t.incomingItemId}`));
  const byTrack = new Map<string, TimelineItem[]>();
  for (const i of state.items) if (i.kind === 'video' && i.src) byTrack.set(i.track, [...(byTrack.get(i.track) ?? []), i]);
  const cuts: JumpCut[] = [];
  for (const items of byTrack.values()) {
    items.sort((x, y) => x.startFrame - y.startFrame);
    for (let k = 0; k + 1 < items.length; k += 1) {
      const a = items[k]!, b = items[k + 1]!;
      if (only && !only.has(a.id) && !only.has(b.id)) continue;
      if (a.src !== b.src || a.startFrame + a.durationInFrames !== b.startFrame) continue;
      if (rate(a) !== 1 || rate(b) !== 1 || a.keyframes || b.keyframes || joined.has(`${a.id}>${b.id}`)) continue;
      if (a.durationInFrames <= half || b.durationInFrames <= half || look(a) !== look(b)) continue;
      const aEnd = (a.srcInFrame ?? 0) + a.durationInFrames;
      const jump = (b.srcInFrame ?? 0) - aEnd;
      if (jump < 1 || jump / fps > MAX_JUMP_SEC) continue;
      cuts.push({ a, b, cutFrame: b.startFrame, half, fromSec: (aEnd - 1 - half) / fps, toSec: ((b.srcInFrame ?? 0) + half) / fps });
    }
  }
  return cuts;
}

/** The overlay for one cut: the morph copy over [cut - half, cut + half), muted, looking like the piece before it. */
export function cutOverlay(cut: JumpCut, copy: { src: string; width: number; height: number; frames: number }, id: string, track: TrackId): TimelineItem {
  const {
    sourceAssetId: _asset, sourceContentHash: _hash, transcript: _t, transcriptGenerationId: _g, transcriptStale: _s, deletedWordIdx: _d,
    silenceFrames: _sf, variants: _v, playbackRate: _r, keyframes: _k, ...rest
  } = cut.a as TimelineItem & { sourceContentHash?: string };
  const frames = cut.half * 2;
  return {
    ...rest, id, track, name: `Smooth cut (${cut.a.name})`, startFrame: cut.cutFrame - cut.half, durationInFrames: frames,
    src: copy.src, srcInFrame: 0, width: copy.width, height: copy.height, volume: 0, fadeInFrames: 0, fadeOutFrames: 0,
    sourceRevision: createMediaSourceRevision({ src: copy.src, kind: 'video', durationInFrames: copy.frames, width: copy.width, height: copy.height }),
    props: {
      ...Object.fromEntries(Object.entries(cut.a.props ?? {}).filter(([key]) => key !== 'rsDepthTrackSrc')),
      rsSmoothCut: { from: cut.a.id, to: cut.b.id, fromSec: cut.fromSec, toSec: cut.toSec },
    },
  } as TimelineItem;
}

/** Where the overlay track goes: straight above the highest track a cut is on (video tracks are listed top first). */
function overlayTrackOrder(state: Pick<TimelineState, 'items' | 'trackOrder' | 'tracks'>, cuts: readonly JumpCut[]): number {
  const videos = timelineTrackIds(state as TimelineState).filter((id) => id !== SMOOTH_CUT_TRACK && trackKind(state as TimelineState, id) === 'video');
  const top = Math.min(...cuts.map((c) => videos.indexOf(c.a.track)).filter((i) => i >= 0));
  return Number.isFinite(top) ? videos.length - top : videos.length;
}

/** Requests sent at once (the server makes up to three side by side). */
const AT_ONCE = 3;

/**
 * Smooth-cut overlays for the jump cuts in `state` (touching `only`, when given): the actions that add them (and their
 * track, the first time), plus notes for what could not be done.
 */
export async function smoothCutActions(
  state: Pick<TimelineState, 'items' | 'fps' | 'transitions' | 'trackOrder' | 'tracks'>, api: Pick<AnalyzeApi, 'smoothCut'>, newId: () => string,
  only?: ReadonlySet<string>, onProgress?: (msg: string) => void,
): Promise<{ actions: AtomicAction[]; made: number; notes: string[] }> {
  // a cut already smoothed keeps its overlay
  const done = new Set(state.items.flatMap((i) => {
    const s = (i.props as { rsSmoothCut?: { from: string; to: string } } | undefined)?.rsSmoothCut;
    return s ? [`${s.from}>${s.to}`] : [];
  }));
  const cuts = findJumpCuts(state, only).filter((c) => !done.has(`${c.a.id}>${c.b.id}`));
  if (!cuts.length || !api.smoothCut) return { actions: [], made: 0, notes: [] };
  const smoothCut = api.smoothCut.bind(api);
  onProgress?.(`Smoothing ${cuts.length} jump cut${cuts.length === 1 ? '' : 's'}`);
  const overlays: TimelineItem[] = [];
  const failed: string[] = [];
  let unavailable: string | null = null;
  let next = 0;
  const worker = async () => {
    while (next < cuts.length && !unavailable) {
      const cut = cuts[next++]!;
      const r = await smoothCut(cut.a.src!, cut.fromSec, cut.toSec, cut.half * 2, state.fps).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
      if ('skipped' in r) { if (r.unavailable) unavailable = r.skipped; continue; }
      if ('error' in r) { failed.push(`the cut at ${(cut.cutFrame / state.fps).toFixed(2)} s in ${cut.a.name} stays a jump: ${r.error}`); continue; }
      overlays.push(cutOverlay(cut, r, newId(), SMOOTH_CUT_TRACK));
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, cuts.length) }, worker));
  const notes = unavailable ? [`jump cuts stay hard cuts: ${unavailable}`, ...failed] : failed;
  if (!overlays.length) return { actions: [], made: 0, notes };
  const hasTrack = !!state.tracks?.[SMOOTH_CUT_TRACK];
  const create: AtomicAction[] = hasTrack ? [] : [{ type: 'track.create', track: { id: SMOOTH_CUT_TRACK, kind: 'video', name: 'Smooth cuts' }, order: overlayTrackOrder(state, cuts) }];
  overlays.sort((x, y) => x.startFrame - y.startFrame);
  return {
    actions: [...create, ...overlays.map((item): AtomicAction => ({ type: 'add', startFrame: item.startFrame, item: item as never }))],
    made: overlays.length, notes,
  };
}
