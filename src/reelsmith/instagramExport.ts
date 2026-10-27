// RS-301/RS-302 client side: after a server video export renders (before it is delivered), make it
// Instagram-ready when the user asked for it and the canvas is 9:16. The report is kept for the dialog.
import type { TimelineState } from '../editor/types';
import { ratioOf } from '../../shared/reelsmith/ratios';
import type { ExportJobResult } from '../export/exportWorkflowTypes';

export interface InstagramExportPreference { enabled: boolean; silent: boolean; srt: boolean; /** RS-1232: <name>.sheet.jpg next to the video */ sheet: boolean; /** RS-1234: <name>.cover.jpg */ cover: boolean }
interface Check { id: string; status: 'PASS' | 'WARN' | 'FAIL'; detail: string }
export interface InstagramExportReport {
  status: 'running' | 'passed' | 'fixed' | 'failed' | 'error' | 'skipped';
  checks?: Check[];
  failedPath?: string;
  message?: string;
  /** outcome of the optional .srt sidecar, shown under the report */
  srt?: string;
  /** RS-1232: outcome of the contact sheet */
  sheet?: string;
  /** RS-1234: outcome of the cover */
  cover?: string;
}

const KEY = 'reelsmith:instagram-export';
export function loadInstagramPreference(): InstagramExportPreference {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Partial<InstagramExportPreference> | null;
    return { enabled: v?.enabled !== false, silent: v?.silent === true, srt: v?.srt === true, sheet: v?.sheet !== false, cover: v?.cover !== false };
  } catch { return { enabled: true, silent: false, srt: false, sheet: true, cover: true }; }
}
export function saveInstagramPreference(p: InstagramExportPreference): void {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
  emit();
}

let last: InstagramExportReport | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
export const instagramReportStore = {
  get: () => last,
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  set: (r: InstagramExportReport | null) => { last = r; emit(); },
};

export const isVertical = (s: Pick<TimelineState, 'width' | 'height'>) => Math.abs(s.width / s.height - 9 / 16) < 0.01;
/** RS-904: any of the supported shapes (9:16, 3:4, 4:5, 1:1, 16:9, 4:3) can be checked and finalised */
export const isSupportedShape = (s: Pick<TimelineState, 'width' | 'height'>) => ratioOf(s.width, s.height) !== undefined;

export function presetIdFor(fps: number, silent: boolean): string {
  if (silent) return 'instagram-reel-silent';
  return fps >= 50 ? 'instagram-reel-60' : 'instagram-reel';
}

/** RS-1231: where the picture stands still on purpose (a freeze frame, a photo), in seconds, so V10 leaves it alone. */
export function intendedHolds(state: Pick<TimelineState, 'items' | 'fps'>): Array<[number, number]> {
  return state.items
    .filter((i) => i.kind === 'image' || (i.props as { rsFreeze?: unknown } | undefined)?.rsFreeze !== undefined)
    .map((i) => [i.startFrame / state.fps, (i.startFrame + i.durationInFrames) / state.fps]);
}

export async function finalizeExportForInstagram(
  state: TimelineState, completed: ExportJobResult, codec: string, signal?: AbortSignal,
  opts: { fetcher?: typeof fetch; setBusy?: (text: string | null) => void } = {},
): Promise<InstagramExportReport> {
  const pref = loadInstagramPreference();
  if (!pref.enabled || !completed.path || codec !== 'h264' || !isSupportedShape(state)) {
    const r: InstagramExportReport = { status: 'skipped', message: !pref.enabled ? 'off' : !isSupportedShape(state) ? 'canvas is not one of the supported shapes' : 'not an H.264 MP4' };
    instagramReportStore.set(r);
    return r;
  }
  instagramReportStore.set({ status: 'running' });
  opts.setBusy?.('Making it Instagram-ready…');
  try {
    const res = await (opts.fetcher ?? fetch)('/api/reelsmith/instagram-finalize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ src: completed.path, presetId: presetIdFor(completed.fps ?? state.fps, pref.silent), width: state.width, height: state.height, holds: intendedHolds(state) }),
    });
    const body = await res.json().catch(() => null) as { result?: { ok: boolean; reencoded: boolean; first: { checks: Check[] }; second?: { checks: Check[] }; failedPath?: string }; error?: string } | null;
    if (!res.ok || !body?.result) throw new Error(body?.error ?? `Instagram check failed (${res.status})`);
    const r = body.result;
    const checks = [...(r.second ?? r.first).checks];
    if (r.ok) {
      // V8: a parity sample is informative only; it never blocks delivery
      opts.setBusy?.('Comparing the export with the preview…');
      try {
        const pr = await (opts.fetcher ?? fetch)('/api/reelsmith/export-parity', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
          body: JSON.stringify({ src: completed.path, state }),
        });
        const pb = await pr.json().catch(() => null) as { check?: Check } | null;
        if (pr.ok && pb?.check) checks.push(pb.check);
      } catch { signal?.throwIfAborted(); }
    }
    const report: InstagramExportReport = {
      status: r.ok ? (r.reencoded ? 'fixed' : 'passed') : 'failed',
      checks,
      ...(r.failedPath ? { failedPath: r.failedPath } : {}),
    };
    instagramReportStore.set(report);
    return report;
  } catch (error) {
    signal?.throwIfAborted();
    const report: InstagramExportReport = { status: 'error', message: error instanceof Error ? error.message : String(error) };
    instagramReportStore.set(report);
    return report;
  }
}
