// RS-1234: the Instagram cover, saved next to the export as <name>.cover.jpg. The frame comes from the exported file:
// the best of a few candidates in each section (or shot), scored by the server on a sharp subject with a calm band for
// the title (`/api/reelsmith/frame-scores`). A frame of a section with no line gets the reel's opening line drawn on it;
// a lined section's frame already shows the reel's own title. When scoring fails, the fixed moment `coverMoment` (the
// longest section with no line, 45% in). The drawn title sits in the centred 3:4 crop Instagram shows on the profile
// grid, so it is never cut off there, in its calmest third (not across faces).
import type { TimelineState } from '../editor/types';
import { findSavedDirector } from './director/directorSession';

export interface CoverPick { atSec: number; title?: string }

const VISUAL = new Set(['video', 'image', 'gif']);

export function coverMoment(state: Pick<TimelineState, 'items' | 'fps'>, seconds: number): CoverPick {
  const fps = state.fps;
  const end = Math.max(0, seconds - 1 / fps);
  const at = (from: number, to: number) => Math.min(end, from + (to - from) * 0.45);
  const build = findSavedDirector(state.items as never)?.build;
  if (build?.spans?.length) {
    const sections = build.plan.sections;
    const overlays = build.plan.overlays ?? [];
    const lined = (k: number) => !!sections[k]?.text || overlays.some((o) => k >= o.from && k <= o.to);
    const opening = sections[0]?.text ?? overlays.find((o) => o.from === 0)?.text;
    const free = build.spans.map((s, k) => ({ ...s, k })).filter((s) => !lined(s.k));
    if (!free.length) return { atSec: at(build.spans[0]!.from, build.spans[0]!.to) };
    const best = free.reduce((a, b) => (b.to - b.from > a.to - a.from + 1e-6 ? b : a));
    return { atSec: at(best.from, best.to), ...(opening ? { title: opening.trim() } : {}) };
  }
  const shots = state.items.filter((i) => VISUAL.has(i.kind));
  if (!shots.length) return { atSec: Math.min(end, seconds / 2) };
  const longest = shots.reduce((a, b) => (b.durationInFrames > a.durationInFrames ? b : a));
  return { atSec: at(longest.startFrame / fps, (longest.startFrame + longest.durationInFrames) / fps) };
}

/**
 * The frames worth scoring: 30%, 50% and 70% into each director section (none within 0.25 s of a cut, where a
 * transition may be mid-way), else into each shot on the base track, plus the hook. At most `max`, evenly spread.
 */
export function coverCandidates(state: Pick<TimelineState, 'items' | 'fps'>, seconds: number, max = 24): CoverPick[] {
  const end = Math.max(0, seconds - 1 / state.fps);
  const build = findSavedDirector(state.items as never)?.build;
  let parts: Array<{ from: number; to: number; title?: string }>;
  if (build?.spans?.length) {
    const sections = build.plan.sections;
    const overlays = build.plan.overlays ?? [];
    const lined = (k: number) => !!sections[k]?.text || overlays.some((o) => k >= o.from && k <= o.to);
    const opening = (sections[0]?.text ?? overlays.find((o) => o.from === 0)?.text)?.trim();
    parts = build.spans.map((s, k) => ({ ...s, ...(opening && !lined(k) ? { title: opening } : {}) }));
  } else {
    const visual = state.items.filter((i) => VISUAL.has(i.kind));
    const base = visual.map((i) => String(i.track)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
    parts = visual.filter((i) => String(i.track) === base).map((i) => ({ from: i.startFrame / state.fps, to: (i.startFrame + i.durationInFrames) / state.fps }));
  }
  const out: CoverPick[] = [];
  for (const p of parts) {
    const lo = p.from + 0.25, hi = p.to - 0.25;
    if (hi <= lo) { out.push({ atSec: Math.min(end, (p.from + p.to) / 2), ...(p.title ? { title: p.title } : {}) }); continue; }
    for (const f of [0.3, 0.5, 0.7]) out.push({ atSec: Math.min(end, +(lo + (hi - lo) * f).toFixed(3)), ...(p.title ? { title: p.title } : {}) });
  }
  const seen = new Set<number>();
  const unique = out.filter((c) => c.atSec >= 0 && !seen.has(c.atSec) && seen.add(c.atSec));
  if (unique.length <= max) return unique;
  return Array.from({ length: max }, (_, k) => unique[Math.floor((k * unique.length) / max)]!);
}

/** The candidate with the best score; none scored → undefined (the caller falls back to `coverMoment`). */
export function pickCover(candidates: readonly CoverPick[], scores: readonly number[]): CoverPick | undefined {
  let best = -1, k = -1;
  candidates.forEach((_, i) => { const s = scores[i] ?? 0; if (s > best) { best = s; k = i; } });
  return best > 0 ? candidates[k] : undefined;
}

export function coverSidecarName(videoName: string): string {
  return `${videoName.replace(/\.[^./\\]+$/, '')}.cover.jpg`;
}

/** Lines of at most `max` characters, broken at spaces (a longer word gets a line of its own). */
export function wrapTitle(text: string, max: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const lastLine = lines.at(-1);
    if (lastLine !== undefined && (lastLine + ' ' + word).length <= max) lines[lines.length - 1] = `${lastLine} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** Where the title can sit in the 3:4 grid crop, as a fraction of its height: upper, middle or lower third. */
export const TITLE_BANDS = [0.2, 0.5, 0.8] as const;

/**
 * The calmest of the three bands (least detail: sky, ground, a wall), where a title reads and covers no face. `gray` is
 * a small greyscale copy of the frame, `w` x `h`. A fixed band put the title across a group's faces (2026-10-28).
 */
export function quietestBand(gray: ArrayLike<number>, w: number, h: number): number {
  const gridH = Math.min(h, (w * 4) / 3), top = (h - gridH) / 2;
  const energy = TITLE_BANDS.map((at) => {
    const y0 = Math.max(1, Math.round(top + gridH * (at - 0.12))), y1 = Math.min(h - 1, Math.round(top + gridH * (at + 0.12)));
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y += 1) for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      sum += Math.abs(gray[i + 1]! - gray[i - 1]!) + Math.abs(gray[i + w]! - gray[i - w]!);
      n += 1;
    }
    return n ? sum / n : Infinity;
  });
  // the middle is where the eye goes first: another third wins only when it is clearly calmer
  const k = energy.indexOf(Math.min(...energy));
  const best = energy[k]! < energy[1]! * 0.8 ? TITLE_BANDS[k]! : 0.5;
  return best;
}

/** The title block: centred, in band `at` (a fraction of the 3:4 grid crop's height) so the profile grid never cuts it. */
export function titleLayout(width: number, height: number, lines: number, at = 0.5) {
  const gridHeight = Math.min(height, (width * 4) / 3);
  const top = (height - gridHeight) / 2;
  const size = Math.round(width * (lines > 2 ? 0.075 : 0.09));
  const lineHeight = Math.round(size * 1.12);
  const centre = top + gridHeight * at;
  return { size, lineHeight, firstBaseline: Math.round(centre - (lineHeight * (lines - 1)) / 2 + size * 0.35), gridTop: top, gridBottom: top + gridHeight };
}

/** The 2D drawing calls the cover needs: an OffscreenCanvas context in the app, a Node canvas in headless scripts. */
type Image2D = { width: number; height: number };
interface Context2D {
  drawImage(image: never, x: number, y: number, w?: number, h?: number): void;
  getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> };
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop(at: number, color: string): void };
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  fillStyle: unknown; font: string; textAlign: string; shadowColor: string; shadowBlur: number;
}

/**
 * Paints the cover onto `g` (already the frame's size): the frame, a soft shade behind the title, the title in the app's
 * bold face, in the calmest third of the 3:4 grid crop. `scratch` gives a small context to measure detail on.
 */
export function paintCover(g: Context2D, image: Image2D, title: string | undefined, scratch: (w: number, h: number) => Context2D): void {
  g.drawImage(image as never, 0, 0);
  if (!title) return;
  const lines = wrapTitle(title, 16).slice(0, 4);
  const sw = 54, sh = Math.round((54 * image.height) / image.width);
  const small = scratch(sw, sh);
  small.drawImage(image as never, 0, 0, sw, sh);
  const rgba = small.getImageData(0, 0, sw, sh).data;
  const gray = Float32Array.from({ length: sw * sh }, (_, i) => 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!);
  const L = titleLayout(image.width, image.height, lines.length, quietestBand(gray, sw, sh));
  const shadeTop = L.firstBaseline - L.size * 1.6, shadeBottom = L.firstBaseline + L.lineHeight * (lines.length - 1) + L.size * 1.2;
  const shade = g.createLinearGradient(0, shadeTop, 0, shadeBottom);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = shade;
  g.fillRect(0, shadeTop, image.width, shadeBottom - shadeTop);
  g.font = `700 ${L.size}px Geist, "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = L.size * 0.25;
  lines.forEach((line, i) => g.fillText(line, image.width / 2, L.firstBaseline + i * L.lineHeight, image.width * 0.88));
}

/** Draws the cover in the browser. */
export async function drawCover(jpegBase64: string, title: string | undefined): Promise<Blob> {
  const bytes = Uint8Array.from(atob(jpegBase64), (c) => c.charCodeAt(0));
  const image = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  const canvas = new OffscreenCanvas(image.width, image.height);
  if (title) await document.fonts?.load?.(`700 ${Math.round(image.width * 0.09)}px Geist`).catch(() => undefined);
  paintCover(canvas.getContext('2d')! as never, image, title, (w, h) => new OffscreenCanvas(w, h).getContext('2d')! as never);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}

/** Never throws: the video is already delivered. */
export async function deliverCover(opts: {
  state: Pick<TimelineState, 'items' | 'fps'>;
  src: string;
  seconds: number;
  videoName: string;
  write: (filename: string, blob: Blob) => Promise<void>;
  fetcher?: typeof fetch;
  draw?: typeof drawCover;
}): Promise<{ status: 'written'; name: string; pick: CoverPick } | { status: 'failed'; message: string }> {
  const fetcher = opts.fetcher ?? fetch;
  const candidates = coverCandidates(opts.state, opts.seconds);
  let pick = coverMoment(opts.state, opts.seconds);
  try {
    const res = await fetcher('/api/reelsmith/frame-scores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src: opts.src, times: candidates.map((c) => c.atSec) }),
    });
    const body = await res.json().catch(() => null) as { scores?: number[] } | null;
    if (res.ok && body?.scores) pick = pickCover(candidates, body.scores) ?? pick;
  } catch { /* the fixed moment */ }
  try {
    const res = await fetcher('/api/reelsmith/frame-jpeg', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src: opts.src, atSec: pick.atSec }),
    });
    const body = await res.json().catch(() => null) as { base64?: string; error?: string } | null;
    if (!res.ok || !body?.base64) throw new Error(body?.error ?? `cover frame failed (${res.status})`);
    const blob = await (opts.draw ?? drawCover)(body.base64, pick.title);
    const name = coverSidecarName(opts.videoName);
    await opts.write(name, blob);
    return { status: 'written', name, pick };
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}
