// RS-1259: which speeds are slow motion that gets in-between frames (server/reelsmith/smoothSlow.ts makes them).

/** Speeds below this are holds, not slow motion (the freeze-frame intro plays at 0.02). */
export const MIN_SMOOTH_RATE = 0.1;

/** A clip speed that is slow motion: from MIN_SMOOTH_RATE up to (not including) normal speed. */
export function isSlowMotion(rate: number | undefined): boolean {
  return typeof rate === 'number' && rate >= MIN_SMOOTH_RATE && rate < 1;
}

/** A slowed clip needs in-between frames when it shows fewer new pictures a second than the reel has frames. */
export function needsSmoothing(rate: number, sourceFps: number, fps: number): boolean {
  return isSlowMotion(rate) && sourceFps * rate < fps * 0.98;
}
