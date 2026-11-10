// RS-1220: the reel with eyes closed. Many reels look finished on mute and fall apart with the sound on: a whoosh after
// its cut, a drop that lands on nothing, a line that pops in between beats, an ending that stops mid-bar. This reads the
// built timeline (picture events, sound effects, lines) against the song's beat grid and names each miss with its time.
import type { AtomicAction } from '../../editor/reducerActions';

export interface SoundFinding { at: number; issue: string; fix: string }

export interface SoundCheckInput {
  actions: readonly AtomicAction[];
  fps: number;
  totalFrames: number;
  /** the song's beats in reel frames (from where it starts), empty without a song */
  beatFrames: readonly number[];
  /** the song's drop in reel frames */
  dropFrame?: number;
}

type Add = Extract<AtomicAction, { type: 'add' }>;
const props = (a: Add) => ((a.item as { props?: Record<string, unknown> }).props ?? {});
/** A sound this far from every picture event plays on nothing (about 2 frames at 30 fps). */
const MISS = 2;

export function soundCheck(input: SoundCheckInput): SoundFinding[] {
  const { fps, beatFrames } = input;
  const out: SoundFinding[] = [];
  const sec = (f: number) => Math.round((f / fps) * 10) / 10;
  const adds = input.actions.filter((a): a is Add => a.type === 'add');
  const footage = adds.filter((a) => (a.item.kind === 'video' || a.item.kind === 'image') && !props(a).rsFront);
  const cuts = new Set(footage.map((a) => a.startFrame ?? 0).filter((f) => f > 0));
  const visual = new Set([
    ...cuts,
    ...adds.filter((a) => a.item.kind === 'motion-graphic' || a.item.kind === 'text').map((a) => a.startFrame ?? 0),
    ...adds.filter((a) => typeof props(a).rsAccent === 'string').map((a) => a.startFrame ?? 0),
  ]);
  const near = (set: ReadonlySet<number> | readonly number[], f: number, d: number) => [...set].some((x) => Math.abs(x - f) <= d);
  // sound effects on nothing
  for (const a of adds) {
    const p = props(a);
    if (typeof p.rsSfx !== 'string' || typeof p.rsAt !== 'number') continue;
    if (p.rsAt <= 0 || p.rsAt >= input.totalFrames) continue;
    if (!near(visual, p.rsAt, MISS)) out.push({ at: sec(p.rsAt), issue: `the ${p.rsSfx} sound at ${sec(p.rsAt)} s plays on no cut, line or graphic`, fix: 'move the section sound to the beat its cut lands on, or drop it' });
  }
  // the drop: a cut or a hit must land on it
  if (input.dropFrame !== undefined && input.dropFrame > fps * 0.5 && input.dropFrame < input.totalFrames - fps * 0.5) {
    const hits = adds.filter((a) => props(a).rsSfx === 'hit').map((a) => props(a).rsAt as number);
    if (!near(cuts, input.dropFrame, MISS + 1) && !near(hits, input.dropFrame, MISS + 1)) {
      out.push({ at: sec(input.dropFrame), issue: `the drop at ${sec(input.dropFrame)} s lands on no cut and no hit: with eyes closed the peak passes unseen`, fix: 'start the peak section on the drop beat (dropAtBeat), or put a cut or a drop-timed effect on it' });
    }
  }
  if (!beatFrames.length) return out;
  // lines that pop in between beats
  const lines = new Map<string, { start: number; text: string }>();
  for (const a of adds) {
    const p = props(a);
    if (typeof p.rsLine !== 'string') continue;
    const prev = lines.get(p.rsLine);
    if (!prev || (a.startFrame ?? 0) < prev.start) lines.set(p.rsLine, { start: a.startFrame ?? 0, text: String(p.rsLineText ?? '') });
  }
  for (const { start, text } of lines.values()) {
    if (start > 0 && !near(beatFrames, start, MISS)) out.push({ at: sec(start), issue: `"${text.slice(0, 30)}" comes in at ${sec(start)} s, between beats`, fix: 'start the line on a beat (its section start, or a whole beat into it)' });
  }
  // the ending: the last beat should close a bar (bars counted from where the song starts)
  let last = 0;
  beatFrames.forEach((f, i) => { if (Math.abs(f - input.totalFrames) < Math.abs(beatFrames[last]! - input.totalFrames)) last = i; });
  const off = Math.abs(beatFrames[last]! - input.totalFrames);
  if (off > MISS + 1) out.push({ at: sec(input.totalFrames), issue: `the reel ends at ${sec(input.totalFrames)} s, between beats`, fix: 'end the last section on a beat' });
  // the build counts reel beat 0 at the song start; when the first beat comes after it, that beat is reel beat 1
  // (validatePlan's reelPhraseBeats). Counted from the first beat instead, a 32-beat reel read as "beat 31, mid-bar"
  const ended = last + ((beatFrames[0] ?? 0) > Math.max(1, 0.02 * fps) ? 1 : 0);
  if (off > MISS + 1) { /* said above */ } else if (ended % 4 !== 0 && ended > 8) out.push({ at: sec(input.totalFrames), issue: `the reel ends on beat ${ended}, mid-bar: the music does not resolve`, fix: `make the beats add up to ${Math.floor(ended / 4) * 4} or ${Math.ceil(ended / 4) * 4}` });
  return out;
}
