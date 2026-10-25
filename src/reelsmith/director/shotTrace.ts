// What the built shots do to the viewer's eye and ear, measured for the review. RS-1228 eye trace (Murch's fourth
// rule): on a fast cut the eye is still where the last subject was, so a subject on the far side of the frame is lost.
// RS-1225: a shot where someone talks most of the time while their sound is off under the song reads as a mistake.
import type { AssemblyClip } from '../assembler/types';
import { focusForRange } from '../titleClear';

/** Shots this short (seconds) are fast cuts, where eye trace matters. */
const FAST_CUT_SEC = 0.9;

/**
 * Where a subject sits on the canvas (0..1 each way) once its shot is cover-fitted: on the axis the picture overflows,
 * crop focus slides it to centre the subject as far as the picture allows.
 */
export function subjectOnCanvas(rect: { x: number; y: number; w: number; h: number }, src: { width: number; height: number }, W: number, H: number): { x: number; y: number } | undefined {
  // a rect covering most of the frame is "nothing found"
  if (rect.w * rect.h > 0.8) return undefined;
  const scale = Math.max(W / src.width, H / src.height);
  const axis = (centre: number, drawn: number, size: number) => {
    const px = centre * drawn;
    const off = drawn > size ? Math.min(drawn - size, Math.max(0, px - size / 2)) : (drawn - size) / 2;
    return Math.round(((px - off) / size) * 1000) / 1000;
  };
  return { x: axis(rect.x + rect.w / 2, src.width * scale, W), y: axis(rect.y + rect.h / 2, src.height * scale, H) };
}

export interface TracedShot {
  startFrame: number;
  item: { kind: string; sourceAssetId?: string; srcInFrame?: number; durationInFrames: number; playbackRate?: number; volume?: number; props?: Record<string, unknown> };
}

export interface ShotTrace {
  eyeJumps: Array<{ section: number; at: number; jump: number }>;
  voices: Array<{ section: number; at: number; seconds: number }>;
}

/** Eye jumps at fast cuts and muted voices, over the base-lane shots in time order (`cuts`: frames where a new shot starts). */
export function traceShots(base: readonly TracedShot[], cuts: readonly number[], clips: readonly AssemblyClip[], o: { fps: number; W: number; H: number; music: boolean }): ShotTrace {
  const { fps } = o;
  const clipOf = (a: TracedShot) => clips.find((x) => x.assetId === a.item.sourceAssetId);
  const sectionOf = (a: TracedShot) => Number(String(a.item.props?.rsSection ?? '').split('-')[0]) - 1;
  const span = (a: TracedShot) => { const from = a.item.srcInFrame ?? 0; return { from, to: from + Math.round(a.item.durationInFrames * (a.item.playbackRate ?? 1)) }; };
  const sec = (f: number) => Math.round((f / fps) * 10) / 10;
  const subjectAt = (a: TracedShot, atEnd: boolean) => {
    const c = clipOf(a);
    if (!c?.width || !c.height) return undefined;
    const { from, to } = span(a);
    const src = atEnd ? Math.max(from, to - Math.round(fps * 0.5)) : from;
    const rect = focusForRange(c, src, src + Math.round(fps * 0.5));
    return rect ? subjectOnCanvas(rect, { width: c.width, height: c.height }, o.W, o.H) : undefined;
  };
  const eyeJumps: ShotTrace['eyeJumps'] = [];
  base.forEach((a, k) => {
    const prev = base[k - 1];
    if (!prev || !cuts.includes(a.startFrame) || prev.startFrame + prev.item.durationInFrames !== a.startFrame) return;
    if (Math.min(prev.item.durationInFrames, a.item.durationInFrames) > fps * FAST_CUT_SEC) return;
    const p = subjectAt(prev, true), q = subjectAt(a, false);
    const section = sectionOf(a);
    if (p && q && section >= 0) eyeJumps.push({ section, at: sec(a.startFrame), jump: Math.round(Math.hypot(p.x - q.x, p.y - q.y) * 100) / 100 });
  });
  const voices: ShotTrace['voices'] = [];
  if (o.music) for (const a of base) {
    if (a.item.kind !== 'video' || (a.item.volume ?? 0) > 0 || a.item.props?.rsRewind || a.item.durationInFrames < fps * 1.5) continue;
    const { from, to } = span(a);
    const ws = (clipOf(a)?.sourceAnalysis?.windows ?? []).filter((w) => w.endFrame > from && w.startFrame < to);
    const talking = ws.filter((w) => w.speech).reduce((n, w) => n + Math.min(to, w.endFrame) - Math.max(from, w.startFrame), 0);
    const section = sectionOf(a);
    if (section >= 0 && talking > (to - from) * 0.6) voices.push({ section, at: sec(a.startFrame), seconds: sec(a.item.durationInFrames) });
  }
  return { eyeJumps, voices };
}
