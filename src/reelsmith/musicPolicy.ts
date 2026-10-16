// RS-602: music start/end choices from the setup form. They travel as params (saved with the run, so re-cuts keep them)
// and are folded into recipe.music before any assembler runs.
import type { Recipe } from '../../shared/reelsmith/recipe';
import { fitToBars, type BeatGrid, type EndPolicy, type StartPolicy } from './beatGrid';

export const MUSIC_PARAM = {
  start: 'musicStart',
  offsetSec: 'musicOffsetSec',
  end: 'musicEnd',
  fadeOutSec: 'musicFadeOutSec',
  fitBars: 'musicFitBars',
} as const;

export const START_POLICIES: Array<{ value: StartPolicy; label: string }> = [
  { value: 'fromStart', label: 'From the beginning' },
  { value: 'firstDownbeat', label: 'First downbeat' },
  { value: 'loudestSection', label: 'Loudest section' },
  { value: 'userOffset', label: 'At a time I choose' },
];

export const END_POLICIES: Array<{ value: EndPolicy; label: string }> = [
  { value: 'fadeOut', label: 'Fade out' },
  { value: 'endOnBar', label: 'End on a bar' },
  { value: 'hardCut', label: 'Hard cut' },
];

const isStart = (v: unknown): v is StartPolicy => START_POLICIES.some((p) => p.value === v);
const isEnd = (v: unknown): v is EndPolicy => END_POLICIES.some((p) => p.value === v);

/** Form defaults for a recipe with music: what the recipe itself says. */
export function musicDefaults(recipe: Recipe): Record<string, string | number | boolean> {
  if (!recipe.music) return {};
  const m = recipe.music;
  return {
    [MUSIC_PARAM.start]: isStart(m.startPolicy) ? m.startPolicy : 'fromStart',
    [MUSIC_PARAM.offsetSec]: 0,
    [MUSIC_PARAM.end]: isEnd(m.endPolicy) ? m.endPolicy : 'hardCut',
    [MUSIC_PARAM.fadeOutSec]: m.fadeOutSec ?? 0,
    [MUSIC_PARAM.fitBars]: false,
  };
}

/** The recipe with the form's music choices applied. Unknown or missing values keep the recipe's own. */
export function withMusicOverrides(recipe: Recipe, params: Record<string, unknown>): Recipe {
  if (!recipe.music) return recipe;
  const start = params[MUSIC_PARAM.start];
  const end = params[MUSIC_PARAM.end];
  const fade = Number(params[MUSIC_PARAM.fadeOutSec]);
  return {
    ...recipe,
    music: {
      ...recipe.music,
      ...(isStart(start) ? { startPolicy: start } : {}),
      ...(isEnd(end) ? { endPolicy: end } : {}),
      ...(params[MUSIC_PARAM.fadeOutSec] !== undefined && Number.isFinite(fade) ? { fadeOutSec: Math.min(10, Math.max(0, fade)) } : {}),
    },
  };
}

export function musicFormErrors(params: Record<string, unknown>): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];
  const off = params[MUSIC_PARAM.offsetSec];
  if (params[MUSIC_PARAM.start] === 'userOffset' && (typeof off !== 'number' || !Number.isFinite(off) || off < 0)) {
    errors.push({ field: MUSIC_PARAM.offsetSec, message: 'enter a time of 0 s or more' });
  }
  const fade = params[MUSIC_PARAM.fadeOutSec];
  if (fade !== undefined && (typeof fade !== 'number' || !Number.isFinite(fade) || fade < 0 || fade > 10)) {
    errors.push({ field: MUSIC_PARAM.fadeOutSec, message: 'between 0 and 10 s' });
  }
  return errors;
}

/** Length of the music clip. "End on a bar" stops it on the last full bar that fits in the reel (for reels whose length
 * is set by footage or speech, not by the beat); otherwise it runs to the end of the reel. */
export function musicEndFrame(recipe: Recipe, grid: BeatGrid, startSec: number, totalFrames: number, fps: number, defaultEnd: EndPolicy): number {
  if ((recipe.music?.endPolicy ?? defaultEnd) !== 'endOnBar') return totalFrames;
  const bar = fitToBars(grid, startSec, totalFrames / fps, 'down', { maxSec: totalFrames / fps });
  const frames = Math.round(bar * fps);
  return frames > 0 && frames <= totalFrames ? frames : totalFrames;
}

/** Fade-out length in frames for the music clip. A hard cut never fades; "end on a bar" keeps the short tail so it does not click. */
export function musicFadeFrames(recipe: Recipe, fps: number, totalFrames: number, defaultEnd: EndPolicy): number {
  const end = recipe.music?.endPolicy ?? defaultEnd;
  if (end === 'hardCut') return 0;
  return Math.min(totalFrames, Math.max(0, Math.round((recipe.music?.fadeOutSec ?? 0) * fps)));
}
