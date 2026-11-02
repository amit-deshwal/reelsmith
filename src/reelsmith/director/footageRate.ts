// RS-1250: build at the footage's frame rate. An iPhone shoots 4K60, the editor starts every project at 30, and a 30 fps
// timeline exported "at 60" only duplicates frames, so a reel of 60 fps clips is built on a 60 fps timeline.
import { projectFrameRateLock } from '../../editor/timelineFrameRate';
import type { ProjectDoc } from '../../editor/types';

/** 60 when at least half the readable clip rates are 50 fps or more; null keeps the timeline's rate. */
export function footageTimelineFps(rates: Array<number | null>): 60 | null {
  const known = rates.filter((r): r is number => typeof r === 'number' && r > 0);
  if (!known.length) return null;
  return known.filter((r) => r >= 50).length * 2 >= known.length ? 60 : null;
}

/**
 * The rate the Director should switch the project to before it starts, or null. Only while nothing is placed yet:
 * every position on a timeline is a frame count, so the editor locks the rate once anything is on it.
 */
export function directorTimelineFps(doc: ProjectDoc, currentFps: number, rates: Array<number | null>): 60 | null {
  if (currentFps >= 50 || projectFrameRateLock(doc)) return null;
  return footageTimelineFps(rates);
}
