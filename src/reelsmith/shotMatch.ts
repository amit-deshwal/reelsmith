// Shot matching: phone clips, messaged photos and screenshots arrive with different exposure and white balance, so one
// look on top of them reads as several different pictures. Before the look, each shot is nudged part of the way toward
// the reel's own median (not toward neutral, so a warm sunset stays warm and a night shot stays dark) with one gain on
// the colour-wheels effect. The nudge is small and clamped; shots that are far off (night, neon) are left alone.
import type { ClipEffect } from '../editor/types';

/** Mean display colour of a shot, 0..1 per channel. */
export interface ColorStats { r: number; g: number; b: number }
export type Gain = [number, number, number];

export const MATCH_EFFECT_ID = 'match_gain';
/** Shots darker than this (mean luma) are night or low-key by intent: they neither move nor set the target. */
export const NIGHT_LUMA = 0.18;
export const MIN_SHOTS = 3;
const EXPOSURE_STRENGTH = 0.6; // exponent on the brightness ratio
const EXPOSURE_RANGE: [number, number] = [0.8, 1.3];
const WB_STRENGTH = 0.5;
const WB_RANGE: [number, number] = [0.9, 1.1];
/** A correction smaller than this on every channel is not worth an effect. */
const NEGLIGIBLE = 0.02;

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
const lumaOf = (c: ColorStats) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
/** Colour cast with the luma divided out: (1,1,1) is neutral, above 1 on a channel means that channel leads. */
const castOf = (c: ColorStats): Gain => { const l = lumaOf(c); return [c.r / l, c.g / l, c.b / l]; };

/** Per-channel gain for every shot that needs one; shots that do not appear are left as they are. */
export function planShotMatch(stats: ReadonlyMap<string, ColorStats>): Map<string, Gain> {
  const out = new Map<string, Gain>();
  const day = [...stats].filter(([, c]) => lumaOf(c) >= NIGHT_LUMA && c.r > 0 && c.g > 0 && c.b > 0);
  if (day.length < MIN_SHOTS) return out;
  const targetLuma = median(day.map(([, c]) => lumaOf(c)));
  const targetCast = [0, 1, 2].map((i) => median(day.map(([, c]) => castOf(c)[i]!)));
  for (const [id, c] of day) {
    const exposure = clamp((targetLuma / lumaOf(c)) ** EXPOSURE_STRENGTH, EXPOSURE_RANGE);
    const cast = castOf(c);
    const gain = [0, 1, 2].map((i) => exposure * clamp((targetCast[i]! / cast[i]!) ** WB_STRENGTH, WB_RANGE)) as Gain;
    if (gain.some((g) => Math.abs(g - 1) > NEGLIGIBLE)) out.set(id, gain);
  }
  return out;
}

/** The colour-wheels effect carrying the gain (its gain wheel: 0.5 is neutral, gain = 0.25 + 1.5 * wheel). */
export function matchEffect(gain: Gain): ClipEffect {
  return { id: MATCH_EFFECT_ID, assetId: 'builtin:fx-color-wheels', overrides: { gainColor: gain.map((g) => Math.min(1, Math.max(0, (g - 0.25) / 1.5))), intensity: 1 } };
}
