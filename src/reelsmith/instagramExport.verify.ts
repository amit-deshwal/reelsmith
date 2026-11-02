import assert from 'node:assert/strict';
import { finalizeExportForInstagram, presetIdFor } from './instagramExport';
import type { TimelineState } from '../editor/types';
import type { ExportJobResult } from '../export/exportWorkflowTypes';

// A 4K export re-encoded to 1080x1920 for Instagram: the result carries the delivered size, so the
// quality check that follows does not report "The export resolution does not match the settings".
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); },
};
const state = { width: 1080, height: 1920, fps: 30, items: [] } as unknown as TimelineState;
const pass = { checks: [{ id: 'V2', status: 'PASS', detail: '1080x1920' }] };
const fetcher = (finalize: Record<string, unknown>) => (async (url: string) => {
  const body = String(url).includes('instagram-finalize') ? finalize : { check: { id: 'V8', status: 'PASS', detail: 'ok' } };
  return new Response(JSON.stringify(body), { status: 200 });
}) as typeof fetch;

const reencoded: ExportJobResult = { path: '/tmp/x.mp4', width: 2160, height: 3840, fps: 60 };
const r1 = await finalizeExportForInstagram(state, reencoded, 'h264', undefined, {
  fetcher: fetcher({ result: { ok: true, reencoded: true, first: pass, second: pass }, width: 1080, height: 1920 }),
});
assert.equal(r1.status, "fixed", r1.message);
assert.deepEqual([reencoded.width, reencoded.height, reencoded.fps], [1080, 1920, 60]);

// a failed re-encode leaves the rendered file (and its size) as it was
const failed: ExportJobResult = { path: '/tmp/y.mp4', width: 2160, height: 3840, fps: 60 };
await finalizeExportForInstagram(state, failed, 'h264', undefined, {
  fetcher: fetcher({ result: { ok: false, reencoded: true, first: pass, second: pass, failedPath: '/tmp/y.failed.mp4' }, width: 1080, height: 1920 }),
});
assert.deepEqual([failed.width, failed.height], [2160, 3840]);
// RS-1250: no music keeps the reel's 60 fps
assert.equal(presetIdFor(60, true), 'instagram-reel-silent-60');
assert.equal(presetIdFor(30, true), 'instagram-reel-silent');
assert.equal(presetIdFor(60, false), 'instagram-reel-60');
console.log('instagramExport.verify: ok');
