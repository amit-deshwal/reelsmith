import type { Recipe } from '../../../shared/reelsmith/recipe';
import type { AtomicAction } from '../../editor/reducerActions';
import { sourcePlacement } from './sourcePlacement';
import type { AssemblyClip, AssemblyMusic } from './types';

export const fpsOf = (r: Recipe) => r.canvas.fps.num / r.canvas.fps.den;
export const dbToGain = (db: number) => 10 ** (db / 20);

/** A plain metronome used when a recipe runs without a song. */
export function metronome(durationSec: number, bpm = 120, beatsPerBar = 4): AssemblyMusic {
  const step = 60 / bpm;
  return {
    assetId: '', name: '', src: '', durationSec, beatsPerBar, downbeatIndex: 0,
    beatTimesSec: Array.from({ length: Math.floor(durationSec / step) + 1 }, (_, i) => i * step),
  };
}

export function clipItem(
  id: string, clip: AssemblyClip, track: string, durationInFrames: number, extra: Record<string, unknown> = {},
  clipGainDb?: number,
): AtomicAction {
  const isVideo = clip.kind === 'video';
  const placement = isVideo ? sourcePlacement(clip, durationInFrames) : undefined;
  return {
    type: 'add',
    item: {
      id, track, kind: clip.kind, name: clip.name, src: clip.src, durationInFrames, sourceAssetId: clip.assetId,
      ...(isVideo ? { srcInFrame: placement!.srcInFrame, playbackRate: placement!.playbackRate === 1 ? undefined : placement!.playbackRate } : {}),
      ...(isVideo && clipGainDb !== undefined ? { volume: dbToGain(clipGainDb) } : {}),
      ...extra,
    } as never,
    startFrame: (extra.__start as number | undefined) ?? 0,
  };
}
