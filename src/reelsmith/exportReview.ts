// RS-1232: a contact sheet of the exported file itself, not of the preview. Cells at the hook, inside each section
// (or shot), on each cut where a transition plays, and the last frame; saved next to the video as <name>.sheet.jpg and
// kept with the export's checks for reels_review_export, so the agent judges what actually shipped.
import type { TimelineState } from '../editor/types';
import { findSavedDirector } from './director/directorSession';

export interface ReviewMoment { atSec: number; label: string }
interface Check { id: string; status: 'PASS' | 'WARN' | 'FAIL'; detail: string }

export interface ExportReview {
  name: string;
  seconds: number;
  moments: ReviewMoment[];
  sheets: string[];
  checks: Check[];
  savedAs: string[];
}

/** Most cells on one review (two sheets of the selection-sheet route). */
export const REVIEW_CELLS = 32;
const VISUAL = new Set(['video', 'image', 'gif']);

const span = (from: number, to: number) => ({ from, to });

/**
 * Where to look: the director's sections when the reel was directed, else each shot on the lowest visual track. A cell
 * 45% into each part (its start is often mid-transition), one on each cut between parts, the hook at 0.3 s and the
 * last frame (the poster a viewer sees when it loops).
 */
export function reviewMoments(state: Pick<TimelineState, 'items' | 'fps'>, seconds: number): ReviewMoment[] {
  const fps = state.fps;
  const saved = findSavedDirector(state.items as never);
  let parts = saved?.build?.spans?.map((s) => span(s.from, s.to)) ?? [];
  let name = (i: number) => `s${i}`;
  if (!parts.length) {
    const visual = state.items.filter((i) => VISUAL.has(i.kind));
    const base = visual.map((i) => String(i.track)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
    parts = visual.filter((i) => String(i.track) === base).sort((a, b) => a.startFrame - b.startFrame)
      .map((i) => span(i.startFrame / fps, (i.startFrame + i.durationInFrames) / fps));
    name = (i) => `shot${i + 1}`;
  }
  const end = Math.max(0, seconds - 1 / fps);
  const out: ReviewMoment[] = [{ atSec: Math.min(0.3, end), label: 'hook' }];
  parts.forEach((p, i) => {
    if (i > 0) out.push({ atSec: p.from, label: 'cut' });
    out.push({ atSec: p.from + (p.to - p.from) * 0.45, label: name(i) });
  });
  out.push({ atSec: end, label: 'end' });
  const inside = out.filter((m) => m.atSec >= 0 && m.atSec <= end);
  // too many shots: keep the hook, the end and an even spread of the rest
  if (inside.length <= REVIEW_CELLS) return inside.map((m) => ({ ...m, label: `${m.label}·${m.atSec.toFixed(1)}` }));
  const middle = inside.slice(1, -1);
  const keep = Array.from({ length: REVIEW_CELLS - 2 }, (_, k) => middle[Math.floor((k * middle.length) / (REVIEW_CELLS - 2))]!);
  return [inside[0]!, ...keep, inside.at(-1)!].map((m) => ({ ...m, label: `${m.label}·${m.atSec.toFixed(1)}` }));
}

export function sheetSidecarName(videoName: string, index: number): string {
  return `${videoName.replace(/\.[^./\\]+$/, '')}.sheet${index ? `-${index + 1}` : ''}.jpg`;
}

let last: ExportReview | null = null;
export const exportReviewStore = { get: () => last, set: (r: ExportReview | null) => { last = r; } };

const jpeg = (base64: string) => new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'image/jpeg' });

/**
 * Sheets the rendered file (before its job is retired) and writes them next to the delivered video. Never throws: the
 * video is already delivered.
 */
export async function deliverReviewSheet(opts: {
  state: Pick<TimelineState, 'items' | 'fps'>;
  src: string;
  seconds: number;
  videoName: string;
  checks: Check[];
  save: boolean;
  write: (filename: string, blob: Blob) => Promise<void>;
  fetcher?: typeof fetch;
}): Promise<{ status: 'written' | 'kept' | 'failed'; message?: string; names?: string[] }> {
  const moments = reviewMoments(opts.state, opts.seconds);
  try {
    const res = await (opts.fetcher ?? fetch)('/api/reelsmith/selection-sheet', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: moments.map((m) => ({ src: opts.src, kind: 'video', atSec: m.atSec, label: m.label })) }),
    });
    const body = await res.json().catch(() => null) as { sheets?: Array<{ base64: string }>; error?: string } | null;
    if (!res.ok || !body?.sheets?.length) throw new Error(body?.error ?? `contact sheet failed (${res.status})`);
    const sheets = body.sheets.map((s) => s.base64);
    const names = opts.save ? sheets.map((_, i) => sheetSidecarName(opts.videoName, i)) : [];
    for (const [i, n] of names.entries()) await opts.write(n, jpeg(sheets[i]!));
    exportReviewStore.set({ name: opts.videoName, seconds: opts.seconds, moments, sheets, checks: opts.checks, savedAs: names });
    return { status: names.length ? 'written' : 'kept', names };
  } catch (error) {
    exportReviewStore.set({ name: opts.videoName, seconds: opts.seconds, moments, sheets: [], checks: opts.checks, savedAs: [] });
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}

/** reels_review_export: the last export's sheet and checks, for the agent's look at what shipped. */
export function reviewExportTool(): unknown {
  const r = exportReviewStore.get();
  if (!r) return { error: 'No export yet in this session. Ask the user to export the reel (Export → Video), then call this again.' };
  const problems = r.checks.filter((c) => c.status !== 'PASS').map((c) => `${c.id} ${c.status}: ${c.detail}`);
  return {
    ...(r.sheets.length ? { __images: r.sheets.map((base64, frame) => ({ frame, base64 })) } : {}),
    file: r.name, seconds: Number(r.seconds.toFixed(2)),
    sheet: r.sheets.length
      ? `${r.sheets.length} sheet(s) from the exported file, 5 cells a row, in reel order: ${r.moments.map((m) => m.label).join(', ')} ("hook" at 0.3 s, "s2" inside section 2 or "shot3" inside shot 3, "cut" on the cut where its transition plays, "end" the last frame).${r.savedAs.length ? ` Saved next to the video as ${r.savedAs.join(', ')}.` : ''}`
      : 'The sheet could not be made from the file; judge from the checks.',
    checks: problems.length ? problems : 'all export checks pass',
    next: 'Judge only these frames, as a viewer seeing the reel for the first time: text readable at phone size and inside the safe area, no awkward mid-transition frame, the hook and the end strong. Name at most three defects with the reel second; fix a directed reel with reels_director_fix, then ask the user to export again.',
  };
}
