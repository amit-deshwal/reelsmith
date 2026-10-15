import type { Recipe } from '../../../shared/reelsmith/recipe';
import type { AtomicAction } from '../../editor/reducerActions';
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
  const srcIn = isVideo ? Math.max(0, Math.min(clip.bestStartFrame ?? 0, Math.max(0, clip.durationInFrames - 1))) : undefined;
  const available = isVideo ? Math.max(1, clip.durationInFrames - (srcIn ?? 0)) : durationInFrames;
  const rate = isVideo ? Math.max(0.25, Math.min(1, available / durationInFrames)) : undefined;
  return {
    type: 'add',
    item: {
      id, track, kind: clip.kind, name: clip.name, src: clip.src, durationInFrames, sourceAssetId: clip.assetId,
      ...(isVideo ? { srcInFrame: srcIn, playbackRate: rate === 1 ? undefined : rate } : {}),
      ...(isVideo && clipGainDb !== undefined ? { volume: dbToGain(clipGainDb) } : {}),
      ...extra,
    } as never,
    startFrame: (extra.__start as number | undefined) ?? 0,
  };
}

export function textItem(
  id: string, text: string, startFrame: number, durationInFrames: number, canvas: { width: number; height: number },
  style: Record<string, unknown>, yPercent: number, track = 'V2',
): AtomicAction {
  return {
    type: 'add',
    item: {
      id, track, kind: 'text', name: text.slice(0, 24), durationInFrames, width: canvas.width, height: canvas.height,
      props: {
        text: style.textTransform === 'uppercase' ? text.toUpperCase() : text,
        fontSize: typeof style.sizePx === 'number' ? style.sizePx : 96,
        color: typeof style.color === 'string' ? style.color : '#ffffff',
        fontWeight: typeof style.fontWeight === 'number' ? style.fontWeight : 700,
        fontFamily: typeof style.fontFamily === 'string' ? style.fontFamily : undefined,
        align: 'center',
      },
      transform: { y: yPercent },
    } as never,
    startFrame,
  };
}
