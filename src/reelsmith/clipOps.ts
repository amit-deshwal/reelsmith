// Clip operations the upstream editor lacks: flip and detach audio. Both return plain editor actions,
// so each is one undo step and works from the clip menu or an agent.
import { resolveClipScaleAxes } from '../editor/clipTransformScale';
import type { AtomicAction } from '../editor/reducerActions';
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
