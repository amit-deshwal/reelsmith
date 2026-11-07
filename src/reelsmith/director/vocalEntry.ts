// "More from the same research" (M12): a section's line comes in with the singer. Editors bring a line on where a sung
// phrase starts, not only on the beat that starts the shot: the words and the voice arrive together. The phrases come
// from the song's transcript (imported songs are transcribed on import; speech-to-text hears singing poorly, its timing
// well, as the lyric reel found in RS-1253). Only the start of each phrase is used, never the words.
import { sungWords, type LyricWord } from './lyrics';

/** A new phrase starts after a gap this long between sung words (s). */
export const PHRASE_GAP_SEC = 0.6;
/** Fewer sung words than this over the whole song reads as an instrumental the transcriber hallucinated on. */
const MIN_SUNG_WORDS = 6;
/** One "word" longer than this is the transcriber filling a held note or a stretch of music, not a sung word. */
const MAX_WORD_SEC = 2.5;

/** Song seconds where each sung phrase starts: the first word, and every word after a gap of PHRASE_GAP_SEC or more. */
export function vocalPhraseStarts(words: readonly LyricWord[] | undefined, gapSec = PHRASE_GAP_SEC): number[] {
  const sung = sungWords(words ?? []).filter((w) => w.end - w.start <= MAX_WORD_SEC * 1000).sort((a, b) => a.start - b.start);
  if (sung.length < MIN_SUNG_WORDS) return [];
  const out: number[] = [];
  let lastEnd = -Infinity;
  for (const w of sung) {
    if (w.start - lastEnd >= gapSec * 1000) out.push(Math.round(w.start) / 1000);
    lastEnd = Math.max(lastEnd, w.end);
  }
  return out;
}

/** The phrase starts inside the reel, as reel seconds, for a song started at `startSec` in a reel of `totalSec`. */
export function reelVocalStarts(phraseStartsSec: readonly number[], startSec: number, totalSec: number): number[] {
  return phraseStartsSec.map((t) => Math.round((t - startSec) * 1000) / 1000).filter((t) => t >= 0 && t < totalSec);
}

/** Beats of the reel where a phrase starts (to the half beat), for the agent; `clock` is the reel's beat clock. */
export function vocalBeats(reelStartsSec: readonly number[], clock: (b: number) => number, maxBeats: number): number[] {
  return [...new Set(reelStartsSec.map((t) => Math.round(beatAt(clock, t, maxBeats) * 2) / 2))].filter((b) => b < maxBeats);
}

/** The fractional beat at reel second t (the clock rises with b), found by halving; never past maxBeats. */
export function beatAt(clock: (b: number) => number, t: number, maxBeats: number): number {
  if (t <= clock(0)) return 0;
  let lo = 0, hi = Math.max(1, maxBeats);
  if (clock(hi) <= t) return hi;
  for (let k = 0; k < 40; k += 1) { const mid = (lo + hi) / 2; if (clock(mid) <= t) lo = mid; else hi = mid; }
  return lo;
}

/** How long a line may wait for the singer: two beats, and never more than a third of its section. */
const MAX_WAIT_BEATS = 2;
const MAX_WAIT_SHARE = 1 / 3;
/** A phrase this close to the cut already comes in with it. */
const TOGETHER_SEC = 0.1;
/** The line keeps at least this long on screen after it comes in (s). */
const MIN_LINE_SEC = 1;

/**
 * Where the line of a section spanning beats [b0, b1) comes in: beats after b0 (0 = with the cut). It waits for the first
 * phrase that starts within its wait (two beats, a third of the section at most) while keeping a second on screen; a
 * phrase sung a moment before the cut (a pickup) or right on it needs no wait.
 */
export function lineEntryBeats(reelStartsSec: readonly number[], b0: number, b1: number, clock: (b: number) => number): number {
  const start = clock(b0), end = clock(b1);
  const wait = Math.min(clock(b0 + MAX_WAIT_BEATS) - start, (end - start) * MAX_WAIT_SHARE);
  const hit = reelStartsSec.find((t) => t > start - TOGETHER_SEC && t <= start + wait && end - t >= MIN_LINE_SEC);
  if (hit === undefined || hit - start <= TOGETHER_SEC) return 0;
  return Math.max(0, beatAt(clock, hit, b1) - b0);
}
