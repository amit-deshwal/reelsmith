// RS-1234: the Instagram cover, saved next to the export as <name>.cover.jpg. The frame comes from the exported file:
// for a directed reel the longest section with no line on it (usually the held hero shot), with the reel's opening line
// as the title; for any other reel the middle of its longest shot, no title. The title sits in the centred 3:4 crop
// Instagram shows on the profile grid, so it is never cut off there.
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

/** The title block: centred, in the middle band of the 3:4 grid crop (lower-middle, under most faces). */
export function titleLayout(width: number, height: number, lines: number) {
  const gridHeight = Math.min(height, (width * 4) / 3);
  const top = (height - gridHeight) / 2;
  const size = Math.round(width * (lines > 2 ? 0.075 : 0.09));
  const lineHeight = Math.round(size * 1.12);
  const centre = top + gridHeight * 0.66;
  return { size, lineHeight, firstBaseline: Math.round(centre - (lineHeight * (lines - 1)) / 2 + size * 0.35), gridTop: top, gridBottom: top + gridHeight };
}

/** Draws the cover in the browser: the frame, a soft shade behind the title, the title in the app's bold face. */
export async function drawCover(jpegBase64: string, title: string | undefined): Promise<Blob> {
  const bytes = Uint8Array.from(atob(jpegBase64), (c) => c.charCodeAt(0));
  const image = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  const canvas = new OffscreenCanvas(image.width, image.height);
  const g = canvas.getContext('2d')!;
  g.drawImage(image, 0, 0);
  if (title) {
    const lines = wrapTitle(title, 16).slice(0, 4);
    const L = titleLayout(image.width, image.height, lines.length);
    const shadeTop = L.firstBaseline - L.size * 1.6, shadeBottom = L.firstBaseline + L.lineHeight * (lines.length - 1) + L.size * 1.2;
    const shade = g.createLinearGradient(0, shadeTop, 0, shadeBottom);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(0.5, 'rgba(0,0,0,0.38)');
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = shade;
    g.fillRect(0, shadeTop, image.width, shadeBottom - shadeTop);
    await document.fonts?.load?.(`700 ${L.size}px Geist`).catch(() => undefined);
    g.font = `700 ${L.size}px Geist, "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = L.size * 0.25;
    lines.forEach((line, i) => g.fillText(line, image.width / 2, L.firstBaseline + i * L.lineHeight, image.width * 0.88));
  }
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
  const pick = coverMoment(opts.state, opts.seconds);
  try {
    const res = await (opts.fetcher ?? fetch)('/api/reelsmith/frame-jpeg', {
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
