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

/** Average glyph width in em; condensed display faces are much narrower than the default sans. */
const CONDENSED = /anton|bebas|oswald|league gothic|barlow condensed|fjalla|teko|six caps/i;
function glyphEm(fontFamily: string | undefined, upper: boolean): number {
  if (fontFamily && CONDENSED.test(fontFamily)) return upper ? 0.5 : 0.44;
  return upper ? 0.72 : 0.6;
}

/**
 * Largest font size <= `wanted` at which the longest line fits inside the Instagram safe width
 * (left 4% + right 10% are covered by the app UI), with a small margin.
 */
export function fitFontSize(text: string, wanted: number, canvasWidth: number, upper = false, fontFamily?: string): number {
  const longest = Math.max(1, ...text.split('\n').map((l) => [...l].length));
  const usable = canvasWidth * 0.86 * 0.94;
  const fit = Math.floor(usable / (longest * glyphEm(fontFamily, upper)));
  return Math.max(28, Math.min(wanted, fit));
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
        fontSize: fitFontSize(text, typeof style.sizePx === 'number' ? style.sizePx : 96, canvas.width, style.textTransform === 'uppercase', typeof style.fontFamily === 'string' ? style.fontFamily : undefined),
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
