// RS-1271 (3): a long shot of a moment where nothing moves reads as a frozen frame. The Goa reel held IMG_2644 for
// 3.8 s from 1.0 s, a beach cafe crowd sitting still with a steady camera: the render had no repeated frames, yet the
// user heard "it froze". The shot log's best moment favours sharp, steady footage, which is exactly the still kind.
// The movement measure is the clip's shake-compensated motionCurve (4 Hz): on 37 Goa clips a 2.5 s stretch of people
// moving or a camera walking reads 0.2-0.9; IMG_2644 reads 0.15 from end to end, still scenery 0.03-0.08.
import type { MotionCurve } from '../assembler/scoring';

/** A shot whose mean movement is under this reads as frozen when it lasts LONG_SHOT_SEC or more. */
export const STILL_MOTION = 0.16;
/** Shots shorter than this pass whatever they show (a still beat between fast cuts is a rest, not a freeze). */
export const LONG_SHOT_SEC = 1.8;
/** A livelier stretch is worth naming only when it moves at least this much. */
export const LIVELY_MOTION = 0.2;

/** Mean movement of the stretch [startSec, startSec + sec) of the clip; undefined without a curve that covers it. */
export function meanMotion(curve: MotionCurve | undefined, startSec: number, sec: number): number | undefined {
  if (!curve?.values.length || curve.hz <= 0) return undefined;
  // sample 0 has no frame before it (always 0)
  const a = Math.max(1, Math.round(startSec * curve.hz) + 1);
  const b = Math.min(curve.values.length, Math.round((startSec + sec) * curve.hz) + 1);
  if (b - a < Math.max(2, Math.floor(sec * curve.hz * 0.6))) return undefined;
  let sum = 0;
  for (let i = a; i < b; i += 1) sum += curve.values[i]!;
  return sum / (b - a);
}

/** The liveliest start (s) of a `sec` stretch of the clip, at quarter seconds, and its movement; undefined without a curve. */
export function liveliestStart(curve: MotionCurve | undefined, clipSec: number, sec: number, ok?: (startSec: number) => boolean): { at: number; motion: number } | undefined {
  if (!curve?.values.length) return undefined;
  let best: { at: number; motion: number } | undefined;
  for (let at = 0; at + sec <= clipSec + 1e-6; at += 0.25) {
    if (ok && !ok(at)) continue;
    const m = meanMotion(curve, at, sec);
    if (m !== undefined && (!best || m > best.motion + 1e-9)) best = { at: Math.round(at * 100) / 100, motion: m };
  }
  return best;
}

/**
 * The build's own pick for a long shot (frames): `s0`, unless that stretch is still and the clip moves elsewhere, away
 * from the stretches already used (`used`, with half a second between). A still 3.8 s hold read as a frozen frame.
 */
export function livelyPick(curve: MotionCurve | undefined, s0: number, len: number, clipFrames: number, fps: number, used: ReadonlyArray<readonly [number, number]>): number {
  if (len / fps < LONG_SHOT_SEC) return s0;
  const here = meanMotion(curve, s0 / fps, len / fps);
  if (here === undefined || here >= STILL_MOTION) return s0;
  const gap = Math.round(fps * 0.5);
  const free = (at: number) => { const a = Math.round(at * fps); return used.every(([u0, u1]) => a + len + gap <= u0 || a >= u1 + gap); };
  const lively = liveliestStart(curve, clipFrames / fps, len / fps, free);
  return lively && lively.motion >= LIVELY_MOTION ? Math.min(Math.round(lively.at * fps), Math.max(0, clipFrames - len)) : s0;
}

/** Tones where a still, held picture is the point (a view, a quiet face), not a freeze. */
export const STILL_TONES = new Set(['calm', 'emotional', 'romantic', 'nostalgic', 'moody', 'royal']);

/** livelyPick for a director section: holds and cuts only, never a shot list (the user's own picks) or a still tone. */
export function livelyFor(moveId: string, plan: { shotList?: boolean; tone?: string }, curve: MotionCurve | undefined, s0: number, len: number, clipFrames: number, fps: number, used: ReadonlyArray<readonly [number, number]>): number {
  return (moveId === 'hold' || moveId === 'cut') && !plan.shotList && !STILL_TONES.has(plan.tone ?? '') ? livelyPick(curve, s0, len, clipFrames, fps, used) : s0;
}

/** The clip is still from end to end: no stretch of `sec` moves (a tripod view, a seated crowd). */
export function stillThroughout(curve: MotionCurve | undefined, clipSec: number, sec = 2.5): boolean {
  const best = liveliestStart(curve, clipSec, Math.min(sec, clipSec));
  return !!best && best.motion < STILL_MOTION;
}
