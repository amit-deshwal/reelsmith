// Speech cleanup (RS-204): cut fillers, stutters and abandoned takes out of a talking clip, at the light / balanced /
// tight levels Captioned Story already uses for pauses. A video clip plays its source continuously (deleting words only
// shortens it), so the clip is cut for real: one clip per kept stretch, back to back, gaps closed. Each piece keeps the
// transcript, and captions on video show only the words inside each piece's source window, so they follow the cuts.
import type { AtomicAction } from '../editor/reducerActions';
import type { TimelineItem } from '../editor/types';
import { isFiller, keptSegments } from '../transcript/edit';
import { msToFrame, type TranscriptWord } from '../transcript/types';

export type CleanupLevel = 'off' | 'light' | 'balanced' | 'tight';
export const CLEANUP_LEVELS: readonly CleanupLevel[] = ['off', 'light', 'balanced', 'tight'];

/** Longest pause kept between words at each level (ms), as Captioned Story's tightening. */
export const PAUSE_MS: Record<Exclude<CleanupLevel, 'off'>, number> = { light: 900, balanced: 600, tight: 350 };
/** Breath kept either side of a cut (ms), so a cut never clips a consonant. */
export const BREATH_MS = 120;

/** Doubled words that are meant ("no no", "very very", "bye bye"), never a stutter. */
const MEANT_TWICE = new Set(['very', 'no', 'so', 'ha', 'haha', 'bye', 'really', 'yes', 'yeah', 'ok', 'okay', 'go', 'come', 'more', 'again', 'hey', 'please', 'wait', 'now', 'one', 'two', 'too', 'much', 'many', 'that', 'had']);
const norm = (text: string) => text.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}']/gu, '');
const endsSentence = (text: string) => /[.?!।]["')\]]*$/.test(text.trim());
const comma = (text: string) => /[,;]["')\]]*$/.test(text.trim());
const cutOff = (text: string) => /[-–—]$/.test(text.trim()) && norm(text).length > 0;

export interface Cleanup {
  /** every word index to remove, ascending */
  idxs: number[];
  fillers: number[];
  stutters: number[];
  retakes: number[];
}

const rank = (level: CleanupLevel) => CLEANUP_LEVELS.indexOf(level);

/** The words to cut at `level`. Words are in source order with source times (ms). */
export function cleanupIndices(words: readonly TranscriptWord[], level: CleanupLevel): Cleanup {
  const out: Cleanup = { idxs: [], fillers: [], stutters: [], retakes: [] };
  if (rank(level) < 1 || !words.length) return out;
  const gone = new Set<number>();
  const mark = (list: number[], ...idx: number[]) => { for (const i of idx) if (!gone.has(i)) { gone.add(i); list.push(i); } };
  const pauseBefore = (i: number) => (i === 0 ? Infinity : words[i]!.start - words[i - 1]!.end);
  const pauseAfter = (i: number) => (i + 1 >= words.length ? Infinity : words[i + 1]!.start - words[i]!.end);

  // um, uh, er (light and up)
  words.forEach((w, i) => { if (isFiller(w.text)) mark(out.fillers, i); });
  if (rank(level) >= 3) {
    // tight: "like", "you know", "I mean", "basically" when set off by a comma or a pause, not when they carry meaning
    const setOff = (first: number, last: number) => comma(words[last]!.text) || (first > 0 && comma(words[first - 1]!.text))
      || (pauseBefore(first) >= 300 && pauseAfter(last) >= 300) || (pauseAfter(last) >= 300 && endsSentence(words[last]!.text));
    words.forEach((w, i) => {
      const a = norm(w.text), b = norm(words[i + 1]?.text ?? '');
      if (['like', 'basically', 'literally'].includes(a) && setOff(i, i)) mark(out.fillers, i);
      if (((a === 'you' && b === 'know') || (a === 'i' && b === 'mean')) && setOff(i, i + 1)) mark(out.fillers, i, i + 1);
    });
  }
  if (rank(level) >= 2) {
    // a word cut off half way ("we wen- we went") and the first of two of the same word ("the the")
    words.forEach((w, i) => { if (cutOff(w.text)) mark(out.stutters, i); });
    // (on the words left, so "we wen- we" is a stutter once the cut-off word is gone)
    const left = words.map((_, i) => i).filter((i) => !gone.has(i));
    left.forEach((i, p) => {
      const j = left[p + 1];
      const a = norm(words[i]!.text);
      if (j !== undefined && a && a === norm(words[j]!.text) && !MEANT_TWICE.has(a) && words[j]!.start - words[i]!.end < 600 && !endsSentence(words[i]!.text)) mark(out.stutters, i);
    });
    // a restarted phrase: "we went to | we went to the fort" keeps the second take. The first take must be exactly the
    // start of the second, must not end a sentence ("I love it. I love you." is two sentences), and the second must go on
    const seq = words.map((_, i) => i).filter((i) => !gone.has(i));
    const key = seq.map((i) => norm(words[i]!.text));
    for (let s = 0; s < seq.length; s += 1) {
      for (let k = Math.min(8, Math.floor((seq.length - s) / 2)); k >= 2; k -= 1) {
        const t = s + k;
        if (t + k >= seq.length) continue; // the second take must continue past the repeat
        let same = true;
        for (let q = 0; q < k && same; q += 1) same = key[s + q] !== '' && key[s + q] === key[t + q];
        if (!same) continue;
        const firstLast = words[seq[t - 1]!]!;
        if (endsSentence(firstLast.text)) continue;
        if (words[seq[t]!]!.start - words[seq[s]!]!.start > 8000) continue;
        mark(out.retakes, ...seq.slice(s, t));
        s = t - 1;
        break;
      }
    }
  }
  out.idxs = [...gone].sort((x, y) => x - y);
  return out;
}

export interface SpeechCut {
  /** source frame where the piece starts, and its length in source frames */
  srcInFrame: number;
  srcFrames: number;
}

/**
 * The pieces of a clip's source window [srcIn, srcIn + span) to keep: every word not in `deleted`, pauses capped at
 * `maxPauseMs` (undefined keeps them), a breath either side of each cut. Before the first word and after the last the
 * clip keeps its own head and tail unless pauses are capped.
 */
export function speechCuts(words: readonly TranscriptWord[], deleted: ReadonlySet<number>, fps: number, window: { srcInFrame: number; srcFrames: number }, maxPauseMs?: number, breathMs = BREATH_MS): SpeechCut[] {
  const w0 = window.srcInFrame, w1 = window.srcInFrame + window.srcFrames;
  const inside = (i: number) => msToFrame(words[i]!.end, fps) > w0 && msToFrame(words[i]!.start, fps) < w1;
  const drop = new Set(deleted);
  words.forEach((_, i) => { if (!inside(i)) drop.add(i); });
  const kept = words.map((_, i) => i).filter((i) => !drop.has(i));
  if (!kept.length) return [];
  const segs = keptSegments([...words], drop, fps, 0, {
    ...(maxPauseMs === undefined ? {} : { maxGapFrames: Math.round((maxPauseMs / 1000) * fps) }),
    cutPadFrames: Math.round((breathMs / 1000) * fps) * 2,
  });
  const pieces = segs.map((s) => ({ from: Math.max(w0, s.srcStartFrame), to: Math.min(w1, s.srcEndFrame) })).filter((p) => p.to > p.from);
  if (!pieces.length) return [];
  if (maxPauseMs === undefined) {
    // keep the head before the first word and the tail after the last when they were not cut
    const firstInside = words.findIndex((_, i) => inside(i));
    const lastInside = words.length - 1 - [...words].reverse().findIndex((_, r) => inside(words.length - 1 - r));
    if (kept[0] === firstInside) pieces[0]!.from = w0;
    if (kept.at(-1) === lastInside) pieces.at(-1)!.to = w1;
  }
  // pieces that touch or overlap after the breath pads are one piece
  const merged: Array<{ from: number; to: number }> = [];
  for (const p of pieces) {
    const last = merged.at(-1);
    if (last && p.from <= last.to) last.to = Math.max(last.to, p.to); else merged.push({ ...p });
  }
  return merged.map((p) => ({ srcInFrame: p.from, srcFrames: p.to - p.from }));
}

/** Where each kept word lands once the clip is cut into `cuts` laid back to back from frame 0 (frames, rate 1). */
export function placeWords(words: readonly TranscriptWord[], deleted: ReadonlySet<number>, cuts: readonly SpeechCut[], fps: number): Array<{ index: number; text: string; startFrame: number; endFrame: number }> {
  const out: Array<{ index: number; text: string; startFrame: number; endFrame: number }> = [];
  let offset = 0;
  const starts = cuts.map((c) => { const at = offset; offset += c.srcFrames; return at; });
  words.forEach((w, index) => {
    if (deleted.has(index)) return;
    const s = msToFrame(w.start, fps), e = msToFrame(w.end, fps);
    const k = cuts.findIndex((c) => c.srcInFrame <= s && s < c.srcInFrame + c.srcFrames);
    if (k < 0) return;
    const c = cuts[k]!;
    out.push({ index, text: w.text, startFrame: starts[k]! + s - c.srcInFrame, endFrame: starts[k]! + Math.min(e, c.srcInFrame + c.srcFrames) - c.srcInFrame });
  });
  return out;
}

/** The clip's source window in source frames at the project rate. */
export function sourceWindow(item: Pick<TimelineItem, 'srcInFrame' | 'durationInFrames' | 'playbackRate'>): { srcInFrame: number; srcFrames: number } {
  return { srcInFrame: item.srcInFrame ?? 0, srcFrames: item.durationInFrames * (item.playbackRate ?? 1) };
}

/**
 * Replace a video clip by its kept pieces, back to back where it was, closing the gap on its track (ripple). The first
 * piece keeps the clip's id (and so its transitions in); each piece keeps the clip's look and transcript.
 */
export function cutActions(item: TimelineItem, cuts: readonly SpeechCut[], newId: () => string): { actions: AtomicAction[]; frames: number } {
  const rate = item.playbackRate ?? 1;
  const { id: _id, startFrame: _s, durationInFrames: _d, srcInFrame: _in, keyframes, ...rest } = item;
  const actions: AtomicAction[] = [{ type: 'remove', id: item.id, ripple: true }];
  let at = item.startFrame;
  cuts.forEach((c, k) => {
    const dur = Math.max(1, Math.round(c.srcFrames / rate));
    actions.push({
      type: 'add', startFrame: at, ripple: true,
      item: { ...rest, id: k === 0 ? item.id : newId(), srcInFrame: c.srcInFrame, durationInFrames: dur, ...(k === 0 && keyframes ? { keyframes } : {}) } as never,
    });
    at += dur;
  });
  return { actions, frames: at - item.startFrame };
}
