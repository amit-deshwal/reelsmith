// Constants and small helpers of the Postcard Collage film (a fixed 22.1 s 16:9 trip film on black: opener strips, title
// shuffle, 59 postcard cuts through a band, a bands/cards/grid/panorama finale), kept because the director's moves
// (postcard-band, cards-finale, strips-reveal) are built from the same timings. The strips and the finale are motion
// graphics (postcardGraphics.ts). All times are seconds of the film, not beats.
import { makeRng } from './rng';
import type { AssemblyClip } from './types';

export const PC = {
  end: 22.1,
  openerEnd: 3.6,
  stripsAt: [0.18, 0.35, 0.52, 0.68, 0.85, 1.05],
  flash: [1.433, 1.517],
  wordsAt: 4.1,
  scramble: [4.5, 5.4],
  placeAt: 5.4,
  fadeSec: 0.3,
  postcards: [5.9, 13.3],
  finaleAt: 13.3,
} as const;

/** Fraction of the frame's height each closing bar covers, [film second, fraction]: three quick steps with holds. */
export const BAR_STEPS: ReadonlyArray<readonly [number, number]> = [
  [2.33, 0], [2.43, 0.06], [2.53, 0.12], [2.6, 0.165], [2.88, 0.165], [2.96, 0.22], [3.04, 0.28], [3.1, 0.33],
  [3.34, 0.33], [3.42, 0.39], [3.49, 0.45], [3.55, 0.5],
];

/** Each black bar of the postcards' band: half the frame at 5.85 s, opening at a constant rate (same as the finale). */
export const bandCover = (sec: number) => Math.max(0, 0.5 - (sec - 5.85) * 0.0632);

/**
 * Lanes, bottom to top. Each layer has its own lane, and so does every pair of items that are on screen together (a
 * lane holds one item at a time); trackBinding stacks V lanes by number, then the T lanes above them.
 */
export const L = {
  bg: 'V1', opener: 'V2', strips: 'V3', person: 'V4', barTop: 'V5', barBottom: 'V6', cards: 'V7', bandTop: 'V8',
  bandBottom: 'V9', finale: 'V10', wordLeft: 'T1', wordRight: 'T2', place: 'T3',
} as const;

/** A face or subject box this wide or this big means a close-up, not a person standing in a view. */
export const isCloseUp = (r: { w: number; h: number }) => r.w > 0.28 || r.w * r.h > 0.15;
/** Postcard order: every clip in turn, the turn order changing each lap; never one twice running; the last is not `avoidLast`. */
export function postcardOrder(clips: AssemblyClip[], count: number, avoidLast?: AssemblyClip): AssemblyClip[] {
  const n = clips.length;
  const out: AssemblyClip[] = [];
  for (let j = 0; j < count && n; j += 1) {
    const lap = Math.floor(j / n);
    const k = j % n;
    // even laps go forward from a moving start, odd laps backward
    let pick = clips[lap % 2 === 0 ? (k + lap) % n : (n - 1 - k + lap) % n]!;
    const prev = out[j - 1];
    const last = j === count - 1;
    if (n > 1 && (pick === prev || (last && pick === avoidLast))) pick = clips.find((c) => c !== prev && !(last && c === avoidLast)) ?? pick;
    out.push(pick);
  }
  return out;
}

/** The place's letters shuffling into place, one state per frame: letters lock from the left; the last state is the place. */
export function scrambleStates(place: string, frames: number, seed: number): string[] {
  const chars = [...place];
  const isLetter = (c: string) => c.toLowerCase() !== c.toUpperCase();
  const letters = chars.filter(isLetter);
  if (!letters.length || frames < 2) return [place];
  const rng = makeRng(seed);
  const n = chars.length;
  return Array.from({ length: frames }, (_, k) => {
    const p = k / (frames - 1);
    return chars.map((c, i) => (!isLetter(c) || p >= 0.35 + (0.6 * i) / Math.max(1, n - 1) ? c : letters[Math.floor(rng() * letters.length)]!)).join('');
  });
}
