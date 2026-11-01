// Director stage 1 (RS-1214): what the footage holds, in words the agent plans from. The build already measures every
// 2 s window of every clip (sharpness, exposure, motion, subject, faces, speech) and tags what each clip shows; the
// agent used to see only four frames at fixed points and guessed its "#n@seconds". Now each clip gets one log line
// (its best moments, where it moves, talks or goes soft) and the contact sheet cells are taken at those best moments.
import type { ClipFeatures, WindowFeatures } from '../assembler/scoring';
import type { ClipShotTags, ShotTag } from '../shotTags';
import { SHOT_TAG_INFO } from '../shotTags';

export interface ShotLogClip {
  /** number in the director's list (#n) */
  n: number;
  kind: 'video' | 'image';
  seconds: number;
  shape?: 'portrait' | 'landscape' | 'square';
  features?: ClipFeatures | null;
  tags?: ClipShotTags;
  /** RS-1240: when it was filmed, on the local clock ("4:12 am", "day 2 · 6:05 am" over several days) */
  filmedAt?: string;
}

/**
 * RS-1240: the local clock time each clip was filmed (from its own metadata), for time labels that are true ("4:12 am"
 * over the night start, as Kino's run guessed at). Days are counted from the first clip's day when the clips span more
 * than one; clips without a time stay unlabelled. Fewer than two timed clips say nothing worth a label.
 */
export function filmedLabels(times: ReadonlyArray<number | undefined>, tzOffsetMin: number): Array<string | undefined> {
  const known = times.filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t > 946_684_800_000);
  if (known.length < 2) return times.map(() => undefined);
  const dayOf = (t: number) => Math.floor((t + tzOffsetMin * 60_000) / 86_400_000);
  const first = Math.min(...known.map(dayOf));
  const days = new Set(known.map(dayOf)).size;
  return times.map((t) => {
    if (typeof t !== 'number' || !known.includes(t)) return undefined;
    const d = new Date(t + tzOffsetMin * 60_000);
    const h = d.getUTCHours(), m = d.getUTCMinutes();
    const clock = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
    return days > 1 ? `day ${dayOf(t) - first + 1} · ${clock}` : clock;
  });
}

/** Project-wide thresholds, so "moving" and "soft" mean the same across clips shot on different phones. */
interface Scale { motionHi: number; motionLo: number; sharpLo: number; stillOk: boolean }

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]!;
};

function scaleOf(clips: readonly ShotLogClip[]): Scale {
  const ws = clips.flatMap((c) => (c.kind === 'video' ? c.features?.windows ?? [] : []));
  const motion = ws.map((w) => w.motion);
  const lo = quantile(motion, 0.25), med = quantile(motion, 0.5);
  // the top third and half again above the median, so ordinary handheld wobble is not "moving"; when most clips move
  // alike (nothing is above that) the median itself counts, as long as it is clearly above the quiet quarter
  let hi = Math.max(quantile(motion, 0.66), med * 1.5, 1e-3);
  if (!motion.some((m) => m >= hi) && med >= lo * 3 && med > 1e-3) hi = med;
  return {
    motionHi: hi, motionLo: lo,
    stillOk: lo < med * 0.8 || lo < 1e-3, sharpLo: quantile(ws.map((w) => w.sharpness), 0.5) * 0.5,
  };
}

/** What makes a moment worth casting: sharp, well exposed, a subject in it, and some life (motion or a face). */
function momentScore(w: WindowFeatures, s: Scale): number {
  const sharp = w.sharpness < s.sharpLo ? 0 : 1;
  const life = Math.min(1, w.motion / Math.max(1e-6, s.motionHi));
  const subject = Math.min(1, Math.max(w.subject, w.face ?? 0) * 3);
  return 0.35 * sharp + 0.2 * w.exposure + 0.25 * life + 0.2 * subject;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const mid = (w: WindowFeatures, fps: number) => (w.startFrame + w.endFrame) / 2 / fps;

/** Runs of windows meeting a test, as "a-b s" spans (merged when they touch). */
function spans(ws: readonly WindowFeatures[], fps: number, test: (w: WindowFeatures) => boolean): string[] {
  const out: Array<[number, number]> = [];
  for (const w of ws) {
    if (!test(w)) continue;
    const a = w.startFrame / fps, b = w.endFrame / fps;
    const last = out.at(-1);
    if (last && a - last[1] < 0.6) last[1] = b; else out.push([a, b]);
  }
  return out.map(([a, b]) => `${Math.round(a)}-${Math.round(b)}s`);
}

/**
 * The k best moments of a clip (source seconds), spread out: at least a fifth of the clip apart, in time order.
 * Without features (analysis failed or still running) they are the old fixed points.
 */
export function bestMoments(clip: ShotLogClip, k: number, fps: number, scale?: Scale): number[] {
  // a moment is where a shot starts: leave about two seconds after it (a 1-beat flash still fits in a short clip)
  const latest = Math.max(0, clip.seconds - Math.min(2, clip.seconds / 3));
  const fixed = () => [...new Set((k === 1 ? [0.5] : Array.from({ length: k }, (_, j) => 0.1 + (0.8 * j) / (k - 1))).map((p) => r1(Math.min(latest, p * clip.seconds))))];
  const ws = clip.features?.windows ?? [];
  if (clip.kind === 'image') return [0];
  if (ws.length < 2) return fixed();
  const s = scale ?? scaleOf([clip]);
  const gap = Math.max(1, clip.seconds / (k + 1));
  const picked: number[] = [];
  for (const w of [...ws].sort((a, b) => momentScore(b, s) - momentScore(a, s))) {
    const t = mid(w, fps);
    if (picked.every((p) => Math.abs(p - t) >= gap)) picked.push(t);
    if (picked.length === k) break;
  }
  // a clip with few long windows: fill with the fixed points that are far enough from the picks
  for (const t of fixed()) if (picked.length < k && picked.every((p) => Math.abs(p - t) >= gap / 2)) picked.push(t);
  return [...new Set(picked.map((t) => r1(Math.min(latest, t))))].sort((a, b) => a - b);
}

const tagWords = (tags?: ClipShotTags) => {
  if (!tags) return '';
  const top = (Object.entries(tags.scores) as Array<[ShotTag, number]>).filter(([, v]) => v >= 0.18).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return top.map(([t]) => SHOT_TAG_INFO[t].label).join(', ');
};

/** One line per clip, e.g. "#5 24.1s video portrait · person moving · best @12 @3 · moving 8-14s · talking 0-3s · soft 18-20s". */
export function shotLogLines(clips: readonly ShotLogClip[], fps: number, k: number): { lines: string[]; moments: Map<number, number[]> } {
  const scale = scaleOf(clips);
  const moments = new Map<number, number[]>();
  const lines = clips.map((c) => {
    const head = `#${c.n} ${r1(c.seconds)}s ${c.kind === 'image' ? 'photo' : 'video'}${c.shape ? ` ${c.shape}` : ''}`;
    const tags = [tagWords(c.tags), c.filmedAt ? `filmed ${c.filmedAt}` : ''].filter(Boolean).join(' · ');
    if (c.kind === 'image') { moments.set(c.n, [0]); return [head, tags].filter(Boolean).join(' · '); }
    const best = bestMoments(c, k, fps, scale);
    moments.set(c.n, best);
    const ws = c.features?.windows ?? [];
    if (!ws.length) return [head, tags, 'not analysed: judge from the sheet'].filter(Boolean).join(' · ');
    const ranked = [...best].sort((a, b) => {
      const at = (t: number) => ws.find((w) => t * fps >= w.startFrame && t * fps <= w.endFrame);
      return momentScore(at(b) ?? ws[0]!, scale) - momentScore(at(a) ?? ws[0]!, scale);
    });
    const moving = spans(ws, fps, (w) => w.motion >= scale.motionHi);
    const still = scale.stillOk && ws.every((w) => w.motion <= scale.motionLo);
    const talking = spans(ws, fps, (w) => w.speech);
    const soft = spans(ws, fps, (w) => w.sharpness < scale.sharpLo || w.exposure < 0.35);
    const face = ws.some((w) => (w.face ?? 0) > 0.01);
    const cuts = (c.features?.shotBoundariesFrame ?? []).map((f) => `${r1(f / fps)}s`);
    return [
      head, tags, `best @${ranked.join(' @')}`,
      still ? 'still throughout' : moving.length ? `moving ${moving.slice(0, 3).join(' ')}` : '',
      face ? 'face' : '', talking.length ? `talking ${talking.slice(0, 2).join(' ')}` : '',
      soft.length ? `soft/dark ${soft.slice(0, 2).join(' ')}` : '', cuts.length ? `cuts at ${cuts.slice(0, 3).join(' ')}` : '',
    ].filter(Boolean).join(' · ');
  });
  return { lines, moments };
}

/** Motion of a clip at a source second, against the project's scale: "moving", "still" or "some". */
export function motionAt(clip: ShotLogClip, atSec: number, fps: number, all: readonly ShotLogClip[]): 'moving' | 'still' | 'some' | undefined {
  const ws = clip.features?.windows ?? [];
  if (clip.kind === 'image') return 'still';
  const w = ws.find((x) => atSec * fps >= x.startFrame && atSec * fps < x.endFrame) ?? ws.at(-1);
  if (!w) return undefined;
  const s = scaleOf(all);
  return w.motion >= s.motionHi ? 'moving' : s.stillOk && w.motion <= s.motionLo ? 'still' : 'some';
}
