// Whisper fine-tunes trained without timestamp tokens (Hindi/Hinglish Apex) make whisper.cpp spread the words evenly over
// its 30 s window, so on a 27 s clip every caption lands late and the lag grows to seconds. whisper.cpp's DTW times each
// token from cross-attention instead. DTW needs flash attention off, and with it off the fine-tune sometimes ends early
// (EOT halfway through the window), so we transcribe again from the last timed token while speech remains.

export interface DtwToken {
  readonly text?: string;
  /** centiseconds from the start of the file; -1 when DTW could not time it */
  readonly t_dtw?: number;
}

export interface DtwSegment {
  readonly text?: string;
  readonly tokens?: readonly DtwToken[];
}

export interface DtwJson {
  readonly transcription?: readonly DtwSegment[];
}

/** whisper.cpp JSON shape that native-asr-utils' whisperTokensToChunks reads. */
export interface OffsetSegment {
  text: string;
  tokens: Array<{ text: string; offsets: { from: number; to: number } }>;
}

export const DTW_WINDOW_MS = 30_000;
const MIN_TAIL_MS = 1_000;
const LAST_TOKEN_MS = 200;
const MAX_TOKEN_MS = 400;

/** Words (and specials) after `afterMs` in DTW order; each token ends where the next begins, times never go backwards. */
export function dtwTokens(json: DtwJson, afterMs: number, endMs: number): Array<{ text: string; ms: number }> {
  const out: Array<{ text: string; ms: number }> = [];
  for (const segment of json.transcription ?? []) {
    for (const token of segment.tokens ?? []) {
      const text = token.text ?? '';
      if (!text.trim() || text.trim().startsWith('[_') || typeof token.t_dtw !== 'number' || token.t_dtw < 0) continue;
      const ms = Math.min(endMs, Math.max(token.t_dtw * 10, out.at(-1)?.ms ?? 0));
      if (ms < afterMs) continue;
      out.push({ text, ms });
    }
  }
  return out;
}

/** True when some 100 ms window after `fromMs` is as loud as quiet speech in this clip (not room tone). */
export function speechAfter(samples: Float32Array, sampleRate: number, fromMs: number): boolean {
  const win = Math.round(sampleRate / 10);
  const rms: number[] = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j += 1) sum += samples[j]! * samples[j]!;
    rms.push(Math.sqrt(sum / win));
  }
  if (!rms.length) return false;
  const loud = [...rms].sort((a, b) => a - b)[Math.floor(rms.length * 0.9)]!;
  const threshold = Math.max(0.005, loud * 0.2);
  return rms.slice(Math.ceil(fromMs / 100)).some((v) => v >= threshold);
}

/**
 * Transcribe in DTW windows: `run(offsetMs)` returns whisper.cpp JSON for [offsetMs, offsetMs + 30 s). Each pass keeps the
 * tokens after the previous pass and the next pass starts at the last timed token, until the clip ends or only silence is left.
 */
export async function transcribeDtwWindows(
  samples: Float32Array,
  sampleRate: number,
  run: (offsetMs: number) => Promise<DtwJson>,
): Promise<{ text: string; segments: OffsetSegment[] }> {
  const endMs = Math.floor((samples.length / sampleRate) * 1000);
  const tokens: Array<{ text: string; ms: number }> = [];
  let offset = 0;
  while (endMs - offset > MIN_TAIL_MS) {
    const got = dtwTokens(await run(offset), offset, endMs);
    // a pass opens with a word, but its first token carries no leading space to say so
    if (got[0] && !/^\s/.test(got[0].text)) got[0] = { ...got[0], text: ` ${got[0].text}` };
    tokens.push(...got);
    const last = got.at(-1)?.ms;
    // no words in a whole window: silence, move on by a window
    const next = last === undefined || last <= offset ? offset + DTW_WINDOW_MS : last;
    if (!speechAfter(samples, sampleRate, next + LAST_TOKEN_MS)) break;
    offset = next;
  }
  const segment: OffsetSegment = { text: tokens.map((t) => t.text).join('').trim(), tokens: [] };
  // DTW gives starts only. A token lasts until the next one, at most MAX_TOKEN_MS, so pauses stay gaps (captions clear,
  // tightening can cut them); a punctuation token is timed at the end of its word and adds no length.
  tokens.forEach((t, i) => {
    const to = /^[\s\p{P}]+$/u.test(t.text) ? t.ms : Math.min(tokens[i + 1]?.ms ?? endMs, t.ms + MAX_TOKEN_MS);
    segment.tokens.push({ text: t.text, offsets: { from: t.ms, to: Math.max(t.ms, to) } });
  });
  return { text: segment.text, segments: segment.tokens.length ? [segment] : [] };
}
