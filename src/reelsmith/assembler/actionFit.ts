// M12 ("More from the same research"): an action completes inside its shot. A cut that lands while a jump, a wave or a
// fast swing of the camera is still moving reads as a mistake; editors cut as the movement settles. The clip analysis
// measures how much moves in the picture four times a second, with handshake taken out (motionCurve); when a clear
// movement is near a shot's cuts, the shot's start is nudged a little so both cuts land on calm frames. A calm cut in
// and a calm cut out mean whatever moves inside the shot finishes inside it.
import type { MotionCurve } from './scoring';

/** Movement counts as an action at this much or more, and at least this many times the clip's usual motion. */
const MIN_PEAK = 0.15;
const PEAK_OVER_MEDIAN = 2;
/** How far around a shot a movement counts as near its cuts (s). */
const EDGE_SEC = 0.25;
/** A start is moved only when its cuts get calmer by this share of the nearby peak... */
const MIN_GAIN = 0.25;
/** ...and only to cuts that are calm for this clip: at most this many times its usual motion. */
const CALM_OVER_MEDIAN = 2;
const CALM_FLOOR = 0.1;
/** A clip that moves this much most of the time (a camera whipping around a group) has no calm frame to find. */
const BUSY_MEDIAN = 0.3;

const median = (xs: readonly number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
const window = (curve: MotionCurve, a: number, b: number) => curve.values.slice(Math.max(0, Math.round(a * curve.hz)), Math.min(curve.values.length, Math.round(b * curve.hz) + 1));

/**
 * How much moves at the moment t (s) of the clip. Sample k measures the change from (k-1)/hz to k/hz, so it sits at the
 * middle of that interval; between middles it is interpolated. A cut just after a swing settles reads calm, a cut in the
 * middle of one does not.
 */
export function motionAt(curve: MotionCurve, t: number): number {
  const { hz, values } = curve;
  const x = t * hz + 0.5; // position in samples
  const k = Math.floor(x);
  const at = (i: number) => values[Math.max(1, Math.min(values.length - 1, i))] ?? 0;
  return at(k) + (at(k + 1) - at(k)) * (x - k);
}

/** The most movement at either cut of a shot of `len` frames from source frame `s`. */
export function cutMotion(curve: MotionCurve, fps: number, s: number, len: number): number {
  return Math.max(motionAt(curve, s / fps), motionAt(curve, (s + len) / fps));
}

/** The clear action near a shot (its peak), or 0 when nothing near it stands out from the clip's usual motion. */
export function nearbyPeak(curve: MotionCurve, fps: number, s: number, len: number, reach: number): number {
  if (!curve.values.length || curve.hz <= 0 || fps <= 0) return 0;
  const peak = Math.max(0, ...window(curve, (s - reach) / fps - EDGE_SEC, (s + len + reach) / fps + EDGE_SEC));
  return peak >= Math.max(MIN_PEAK, PEAK_OVER_MEDIAN * median(curve.values)) ? peak : 0;
}

/**
 * The start in [lo, hi], at most `maxShift` frames from `s0`, whose cuts are calmest; `s0` unless a clear action is near
 * and another start makes the cuts clearly calmer (MIN_GAIN of its peak) and calm for the clip (CALM_OVER_MEDIAN); never in a
 * clip busy all through (BUSY_MEDIAN). Among equally calm starts the nearest wins.
 * `ok` may veto a start (one already used).
 */
export function fitAction(curve: MotionCurve | undefined, fps: number, s0: number, len: number, o: { lo: number; hi: number; maxShift: number; step?: number; ok?: (s: number) => boolean }): number {
  if (!curve?.values.length || o.hi < o.lo || len <= 0 || median(curve.values) >= BUSY_MEDIAN) return s0;
  const peak = nearbyPeak(curve, fps, s0, len, o.maxShift);
  if (!peak) return s0;
  const here = cutMotion(curve, fps, s0, len);
  let best = { s: s0, v: here };
  const step = Math.max(1, o.step ?? Math.round(fps / curve.hz / 2));
  // outward from the planned start, both ends included
  const offsets = new Set<number>([o.maxShift, -o.maxShift]);
  for (let d = step; d < o.maxShift; d += step) { offsets.add(d); offsets.add(-d); }
  for (const s of [...offsets].map((d) => s0 + d)) {
    if (s < o.lo || s > o.hi || (o.ok && !o.ok(s))) continue;
    const v = cutMotion(curve, fps, s, len);
    if (v < best.v - 1e-9 || (Math.abs(v - best.v) < 1e-9 && Math.abs(s - s0) < Math.abs(best.s - s0))) best = { s, v };
  }
  const calm = Math.max(CALM_FLOOR, CALM_OVER_MEDIAN * median(curve.values));
  return (here - best.v) / peak >= MIN_GAIN && best.v <= calm ? best.s : s0;
}
