// RS-1253: a lyric reel. The song's sung words appear one at a time as they are sung, big and behind the person (the
// lyric videos where the singer's head passes in front of each word). The words are the song's transcript; when the user
// gives the lyrics, their words replace the transcribed ones in order and keep the sung timing (speech-to-text hears
// singing poorly, the timing well). They become the caption track's own words at reel times: a transcript on the song's
// clip would make it a word-edited clip, which plays only from the first sung word to the last (no intro, off the beat).
import type { AtomicAction } from '../../editor/reducerActions';
import { captionsFor } from '../captionStyles';

export interface LyricWord { text: string; start: number; end: number }

/** The default look: one huge word at a time behind the person. */
export const LYRICS_CAPTION_STYLE = 'lyrics-behind';

/** Sung words only: the transcriber's "[Music]", "♪" and empty tokens are not lyrics. */
export function sungWords(words: readonly LyricWord[]): LyricWord[] {
  return words.filter((w) => /\p{L}/u.test(w.text) && !/^\s*[[(].*[\])]\s*$/.test(w.text) && w.end > w.start);
}

/**
 * The user's lyrics on the transcribed timing. With as many words as were heard each takes its place; otherwise the
 * words spread over the heard ones in order (several heard words make one of theirs, or one heard word is shared out
 * evenly), so every line still lands where it is sung.
 */
export function alignLyrics(heard: readonly LyricWord[], text: string): LyricWord[] {
  const slots = sungWords(heard);
  const tokens = text.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  if (!slots.length || !tokens.length) return [];
  const nT = slots.length, nU = tokens.length;
  const span = tokens.map((_, i) => {
    const a = Math.min(nT - 1, Math.floor((i * nT) / nU));
    return [a, Math.max(a, Math.min(nT - 1, Math.floor(((i + 1) * nT) / nU) - 1))] as const;
  });
  const out: LyricWord[] = [];
  for (let i = 0; i < nU;) {
    let j = i;
    while (j + 1 < nU && span[j + 1]![0] === span[i]![0] && span[j + 1]![1] === span[i]![1]) j++;
    const [a, b] = span[i]!;
    const from = slots[a]!.start, to = slots[b]!.end, n = j - i + 1;
    for (let k = 0; k < n; k++) {
      out.push({ text: tokens[i + k]!, start: Math.round(from + ((to - from) * k) / n), end: Math.round(from + ((to - from) * (k + 1)) / n) });
    }
    i = j + 1;
  }
  return out;
}

/** The sung words at reel times (ms from the reel start), for a song started at `startSec` in a reel of `totalMs` ms. */
export function reelLyrics(words: readonly LyricWord[], startSec: number, totalMs: number): LyricWord[] {
  const off = startSec * 1000;
  // a word counts when at least half of it is sung inside the reel; it is clipped to the reel
  return sungWords(words).filter((w) => { const mid = (w.start + w.end) / 2 - off; return mid >= 0 && mid < totalMs; })
    .map((w) => ({ text: w.text, start: Math.max(0, Math.round(w.start - off)), end: Math.min(totalMs, Math.round(w.end - off)) }))
    .filter((w) => w.end > w.start);
}

/** The caption track of the lyrics: its own words at reel times, in the lyric style (the word and its highlight one colour). */
export function lyricsCaptions(words: readonly LyricWord[], opts: { style?: string; color?: string }): AtomicAction {
  const look = captionsFor(opts.style || LYRICS_CAPTION_STYLE);
  return {
    type: 'setCaptions',
    captions: {
      enabled: true, ...look, sourceMode: 'item', offsetFrames: 0,
      words: words.map((w, i) => ({ id: `lyric-${i}`, text: w.text, start: w.start, end: w.end })),
      ...(opts.color ? { styleOverride: { ...look.styleOverride, color: opts.color, highlightColor: opts.color } } : {}),
    } as never,
  };
}
