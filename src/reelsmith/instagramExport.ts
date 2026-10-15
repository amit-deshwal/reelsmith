// RS-301/RS-302 client side: after a server video export renders (before it is delivered), make it
// Instagram-ready when the user asked for it and the canvas is 9:16. The report is kept for the dialog.
import type { TimelineState } from '../editor/types';
import type { ExportJobResult } from '../export/exportWorkflowTypes';

export interface InstagramExportPreference { enabled: boolean; silent: boolean }
interface Check { id: string; status: 'PASS' | 'WARN' | 'FAIL'; detail: string }
export interface InstagramExportReport {
  status: 'running' | 'passed' | 'fixed' | 'failed' | 'error' | 'skipped';
  checks?: Check[];
  failedPath?: string;
  message?: string;
}

const KEY = 'reelsmith:instagram-export';
export function loadInstagramPreference(): InstagramExportPreference {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Partial<InstagramExportPreference> | null;
    return { enabled: v?.enabled !== false, silent: v?.silent === true };
  } catch { return { enabled: true, silent: false }; }
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

export function presetIdFor(fps: number, silent: boolean): string {
  if (silent) return 'instagram-reel-silent';
  return fps >= 50 ? 'instagram-reel-60' : 'instagram-reel';
}

export async function finalizeExportForInstagram(
  state: TimelineState, completed: ExportJobResult, codec: string, signal?: AbortSignal,
  opts: { fetcher?: typeof fetch; setBusy?: (text: string | null) => void } = {},
): Promise<InstagramExportReport> {
  const pref = loadInstagramPreference();
  if (!pref.enabled || !completed.path || codec !== 'h264' || !isVertical(state)) {
    const r: InstagramExportReport = { status: 'skipped', message: !pref.enabled ? 'off' : !isVertical(state) ? 'canvas is not 9:16' : 'not an H.264 MP4' };
    instagramReportStore.set(r);
    return r;
  }
  instagramReportStore.set({ status: 'running' });
  opts.setBusy?.('Making it Instagram-ready…');
  try {
    const res = await (opts.fetcher ?? fetch)('/api/reelsmith/instagram-finalize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ src: completed.path, presetId: presetIdFor(completed.fps ?? state.fps, pref.silent) }),
    });
    const body = await res.json().catch(() => null) as { result?: { ok: boolean; reencoded: boolean; first: { checks: Check[] }; second?: { checks: Check[] }; failedPath?: string }; error?: string } | null;
    if (!res.ok || !body?.result) throw new Error(body?.error ?? `Instagram check failed (${res.status})`);
    const r = body.result;
    const report: InstagramExportReport = {
      status: r.ok ? (r.reencoded ? 'fixed' : 'passed') : 'failed',
      checks: (r.second ?? r.first).checks,
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
