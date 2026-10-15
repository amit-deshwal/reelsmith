// RS-107 client: assemble the recipe off-timeline and ask the server for a short 360x640 loop of it.
import { historyReduce } from '../editor/reduce';
import type { MediaAsset, TimelineState } from '../editor/types';
import { activeTimeline } from '../editor/types';
import { docFromTimeline } from '../persist/projectStore';
import type { RunOutcome } from './runRecipe';
import { bindTracks } from './trackBinding';

export function previewDoc(out: RunOutcome, assets: readonly MediaAsset[], fps: number) {
  const blank = {
    fps, width: 1080, height: 1920, items: [], selectedId: null, trackOrder: ['track_v1'], tracks: { track_v1: { kind: 'video' } },
  } as unknown as TimelineState;
  let h = { past: [], present: docFromTimeline(blank, 'Preview'), future: [] } as Parameters<typeof historyReduce>[0];
  const used = new Set(out.result.report.usedAssetIds);
  const action = out.action!;
  for (const a of action.actions) if (a.type === 'add' && a.item.sourceAssetId) used.add(a.item.sourceAssetId);
  h = historyReduce(h, { type: 'batch', label: 'pool', actions: assets.filter((a) => used.has(a.id)).map((asset) => ({ type: 'addAsset' as const, asset })) });
  h = historyReduce(h, bindTracks(action, activeTimeline(h.present)));
  return h.present;
}

export async function requestPreview(out: RunOutcome, assets: readonly MediaAsset[], fps: number, fetcher: typeof fetch = fetch): Promise<{ src: string; ms: number }> {
  if (!out.action) throw new Error('nothing to preview');
  const res = await fetcher('/api/reelsmith/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: previewDoc(out, assets, fps), seconds: 5 }),
  });
  const body = await res.json().catch(() => null) as { src?: string; ms?: number; error?: string } | null;
  if (!res.ok || !body?.src) throw new Error(body?.error ?? `preview failed (${res.status})`);
  return { src: body.src, ms: body.ms ?? 0 };
}
