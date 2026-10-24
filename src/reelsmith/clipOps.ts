// Clip operations the upstream editor lacks: flip, detach audio and reverse. Each returns plain editor actions,
// so each is one undo step and works from the clip menu or an agent.
import { resolveClipScaleAxes } from '../editor/clipTransformScale';
import { createMediaSourceRevision } from '../editor/mediaSourceRevision';
import type { AtomicAction } from '../editor/reducerActions';
import type { RelinkableTimelineItem } from '../editor/reducerTimelineHelpers';
import type { TimelineItem } from '../editor/types';

export type FlipAxis = 'horizontal' | 'vertical';

/** Mirror a clip by negating its scale on one axis; flipping again restores it. */
export function flipActions(item: Pick<TimelineItem, 'id' | 'transform'>, axis: FlipAxis): AtomicAction[] {
  const { scaleX, scaleY } = resolveClipScaleAxes(item.transform);
  return [{ type: 'setTransform', id: item.id, patch: axis === 'horizontal' ? { scaleX: -scaleX } : { scaleY: -scaleY } }];
}

export function isFlipped(item: Pick<TimelineItem, 'transform'>, axis: FlipAxis): boolean {
  const { scaleX, scaleY } = resolveClipScaleAxes(item.transform);
  return (axis === 'horizontal' ? scaleX : scaleY) < 0;
}

export function canDetachAudio(item: TimelineItem): boolean {
  return item.kind === 'video' && !!item.src && (item.volume ?? 1) > 0;
}

/** Copy a video clip's sound to a new audio track (same source range, speed and volume) and mute the video. */
export function detachAudioActions(item: TimelineItem, newItemId: string, newTrackId: string): AtomicAction[] | null {
  if (!canDetachAudio(item)) return null;
  const audio = {
    id: newItemId, track: newTrackId, kind: 'audio' as const, name: `${item.name} (audio)`,
    src: item.src, durationInFrames: item.durationInFrames, srcInFrame: item.srcInFrame, playbackRate: item.playbackRate,
    sourceAssetId: item.sourceAssetId, sourceRevision: item.sourceRevision, sourceContentHash: item.sourceContentHash,
    sourceFilename: item.sourceFilename, originalFilePath: item.originalFilePath,
    volume: item.volume ?? 1, fadeInFrames: item.fadeInFrames, fadeOutFrames: item.fadeOutFrames,
  };
  return [
    { type: 'track.create', track: { id: newTrackId, kind: 'audio', name: 'Detached audio' } },
    { type: 'add', startFrame: item.startFrame, item: audio as never },
    { type: 'setVolume', id: item.id, volume: 0 },
  ];
}

/** What a reversed clip played before, kept on the clip (`props.rsReversed`) so "Play forwards" can put it back. */
export interface ReversedFrom {
  src: string; srcInFrame?: number; width?: number; height?: number;
  /** the media pool asset it came from (the reversed copy is not in the pool) */
  assetId?: string;
  sourceRevision?: string; sourceContentHash?: string; sourceSize?: number; sourceModifiedAt?: number; sourceFilename?: string; originalFilePath?: string;
}

export interface ReversedSource { src: string; width: number; height: number; frames: number }

export const reversedFrom = (item: Pick<TimelineItem, 'props'>): ReversedFrom | undefined => item.props?.rsReversed as ReversedFrom | undefined;
export const isReversed = (item: Pick<TimelineItem, 'props'>): boolean => !!reversedFrom(item)?.src;

/** A video clip with a source file can be reversed; a clip linked to others is not, since its partners would stay forwards. */
export function canReverse(item: TimelineItem, linked = false): boolean {
  return item.kind === 'video' && !!item.src && !linked;
}

/** The source span the clip shows: its start second and its length in frames at the project rate (speed included). */
export function reverseSpanOf(item: Pick<TimelineItem, 'srcInFrame' | 'durationInFrames' | 'playbackRate'>, fps: number): { startSec: number; frames: number } {
  return { startSec: (item.srcInFrame ?? 0) / fps, frames: Math.max(1, Math.ceil(item.durationInFrames * (item.playbackRate ?? 1) - 1e-6)) };
}

/**
 * Play the clip backwards: relink it to the reversed copy of its span (from frame 0 of that copy, since the copy is
 * exactly the span) and remember the forwards source. Place, speed, look, effects and keyframes stay; one undo step.
 */
function forwardsOf(clip: TimelineItem): ReversedFrom {
  const item = clip as RelinkableTimelineItem;
  return {
    src: item.src!, srcInFrame: item.srcInFrame, width: item.width, height: item.height, ...(item.sourceAssetId ? { assetId: item.sourceAssetId } : {}),
    sourceRevision: item.sourceRevision, sourceContentHash: item.sourceContentHash, sourceSize: item.sourceSize,
    sourceModifiedAt: item.sourceModifiedAt, sourceFilename: item.sourceFilename, originalFilePath: item.originalFilePath,
  };
}

const revisionOf = (rev: ReversedSource) => createMediaSourceRevision({ src: rev.src, kind: 'video', durationInFrames: rev.frames, width: rev.width, height: rev.height });
const fileNameOf = (src: string) => decodeURIComponent(src.split('/').pop() ?? '');

/** A new clip (not yet on the timeline, e.g. one a director build is about to add) that plays the reversed copy instead. */
export function reversedItem<T extends TimelineItem>(item: T, rev: ReversedSource): T {
  const { sourceAssetId: _a, sourceContentHash: _h, originalFilePath: _o, sourceSize: _s, sourceModifiedAt: _m, ...rest } = item as T & RelinkableTimelineItem;
  return {
    ...rest, src: rev.src, srcInFrame: 0, width: rev.width, height: rev.height, sourceRevision: revisionOf(rev), sourceFilename: fileNameOf(rev.src),
    props: { ...(item.props ?? {}), rsReversed: forwardsOf(item) },
  } as unknown as T;
}

export function reverseActions(item: TimelineItem, rev: ReversedSource): AtomicAction[] {
  const from = forwardsOf(item);
  return [
    {
      type: 'relinkTimelineItem', id: item.id, src: rev.src, kind: 'video', durationInFrames: rev.frames, width: rev.width, height: rev.height,
      // a new revision, so cached frames of the forwards clip are not shown for the reversed one
      sourceRevision: revisionOf(rev),
      sourceContentHash: undefined, sourceSize: undefined, sourceModifiedAt: undefined, originalFilePath: undefined,
      sourceFilename: fileNameOf(rev.src),
    },
    { type: 'updateProps', id: item.id, patch: { rsReversed: from } },
  ];
}

/** Back to the forwards source and the span it started at. */
export function forwardsActions(item: TimelineItem): AtomicAction[] | null {
  const from = reversedFrom(item);
  if (!from?.src) return null;
  return [
    {
      type: 'relinkTimelineItem', id: item.id, src: from.src, kind: 'video', width: from.width, height: from.height,
      sourceRevision: from.sourceRevision, sourceContentHash: from.sourceContentHash, sourceSize: from.sourceSize,
      sourceModifiedAt: from.sourceModifiedAt, sourceFilename: from.sourceFilename, originalFilePath: from.originalFilePath,
    },
    { type: 'retime', id: item.id, srcInFrame: from.srcInFrame ?? 0 },
    { type: 'updateProps', id: item.id, patch: { rsReversed: undefined } },
  ];
}

/** Ask the local server for the reversed copy of the clip's span (made once per span, kept next to the source). */
export async function reversedSource(item: TimelineItem, fps: number, fetcher: typeof fetch = fetch): Promise<ReversedSource> {
  const response = await fetcher('/api/reelsmith/reverse-clip', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src: item.src, ...reverseSpanOf(item, fps), fps }),
  });
  const body = await response.json().catch(() => ({})) as Partial<ReversedSource> & { error?: string };
  if (!response.ok || !body.src || !body.width || !body.height || !body.frames) throw new Error(body.error ?? 'Could not reverse this clip');
  return { src: body.src, width: body.width, height: body.height, frames: body.frames };
}
