// RS-1251: a director reel led by the user's own narration. The voiceover is the reel's spine: it plays whole at full
// level, the song (if any) dips under every stretch of speech, and the words become word-timed captions. Nothing the
// director adds may talk over it, cut it short or fade it out.
import type { AtomicAction } from '../../editor/reducerActions';
import type { AssemblyVoiceover } from '../assembler/types';
import { captionsFor } from '../captionStyles';
import type { NaturalWindow } from './naturalSound';

/** The voiceover's own lane: "A0" sorts before the song (A1) and the sound effects (A2+), so it is the top audio track. */
export const VOICE_LANE = 'A0';
/** Default caption look for the narration. */
export const VOICE_CAPTION_STYLE = 'highlight-word';
/** A pause shorter than this keeps the song down (it would pump up and down between words). */
const JOIN_GAP_SEC = 0.6;

/** How many reel frames the voiceover runs from `startSec`. */
export function voiceFrames(voice: AssemblyVoiceover, startSec: number, fps: number): number {
  return Math.max(1, Math.round(Math.max(0, voice.durationSec - startSec) * fps));
}

/**
 * Stretches of speech in reel frames (the song dips under each). Without a transcript the whole voiceover counts as
 * speech, so the song stays under it all the way.
 */
export function speechWindows(voice: AssemblyVoiceover, startSec: number, fps: number, total: number): NaturalWindow[] {
  const length = Math.min(total, voiceFrames(voice, startSec, fps));
  const words = (voice.transcript ?? []).filter((w) => w.end / 1000 > startSec && w.start / 1000 < startSec + length / fps);
  if (!words.length) return [{ from: 0, to: length, solo: false }];
  const out: NaturalWindow[] = [];
  for (const w of words) {
    const from = Math.max(0, Math.round((w.start / 1000 - startSec) * fps));
    const to = Math.min(length, Math.round((w.end / 1000 - startSec) * fps));
    const last = out.at(-1);
    if (last && from - last.to <= Math.round(JOIN_GAP_SEC * fps)) last.to = Math.max(last.to, to);
    else out.push({ from, to: Math.max(from + 1, to), solo: false });
  }
  return out;
}

/** The narration's sentences as "from-to text" lines in seconds from the file start, for the agent to cut to. */
export function voiceLines(words: ReadonlyArray<{ text: string; start: number; end: number }>, maxLines = 24): string[] {
  const lines: string[] = [];
  let from = 0;
  words.forEach((w, k) => {
    const next = words[k + 1];
    if (/[.?!।]$/.test(w.text.trim()) || !next || next.start - w.end > JOIN_GAP_SEC * 1000) {
      const part = words.slice(from, k + 1);
      lines.push(`${(part[0]!.start / 1000).toFixed(1)}-${(w.end / 1000).toFixed(1)} ${part.map((x) => x.text.trim()).join(' ')}`);
      from = k + 1;
    }
  });
  return lines.slice(0, maxLines);
}

/** The narration on its own lane from the reel start, whole, at full level, carrying its transcript for the captions. */
export function voiceoverActions(voice: AssemblyVoiceover, opts: {
  startSec: number; fps: number; total: number; id: string; captions?: string | false;
}): AtomicAction[] {
  const { startSec, fps, total } = opts;
  const actions: AtomicAction[] = [{
    type: 'add', startFrame: 0,
    item: {
      id: opts.id, track: VOICE_LANE, kind: 'audio', name: voice.name, src: voice.src, sourceAssetId: voice.assetId,
      durationInFrames: Math.min(total, voiceFrames(voice, startSec, fps)), srcInFrame: Math.round(startSec * fps), volume: 1,
      ...(voice.transcript?.length ? { transcript: voice.transcript.map((w) => ({ text: w.text, start: w.start, end: w.end })) } : {}),
      props: { rsVoiceover: true },
    } as never,
  }];
  if (voice.transcript?.length && opts.captions !== false) {
    actions.push({ type: 'setCaptions', captions: { enabled: true, ...captionsFor(opts.captions || VOICE_CAPTION_STYLE), sourceMode: 'timeline' } as never });
  }
  return actions;
}

/** Whether a reel-frame span overlaps any speech window. */
export function overSpeech(from: number, to: number, windows: readonly NaturalWindow[]): boolean {
  return windows.some((w) => from < w.to && to > w.from);
}
