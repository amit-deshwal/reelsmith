import assert from 'node:assert/strict';
import { DIRECTOR_PROP } from './director/directorSession';
import { deliverReviewSheet, exportReviewStore, reviewExportTool, reviewMoments, sheetSidecarName } from './exportReview';

// RS-1232: the review looks at the exported file at the hook, inside each part, on each cut and at the end
const clip = (id: string, track: string, from: number, to: number, kind = 'video') => ({ id, track, kind, startFrame: from * 30, durationInFrames: (to - from) * 30, name: id }) as never;
const shots = reviewMoments({ fps: 30, items: [clip('a', 'V1', 0, 2), clip('b', 'V1', 2, 5), clip('t', 'V2', 0, 5, 'text'), clip('over', 'V2', 1, 3)] }, 5);
assert.deepEqual(shots.map((m) => m.label), ['hook·0.3', 'shot1·0.9', 'cut·2.0', 'shot2·3.4', 'end·5.0']);

// a directed reel: its sections, not its clips (a section has several shots and lanes)
const canvas = { id: 'c', track: 'V1', kind: 'solid', startFrame: 0, durationInFrames: 240, name: 'canvas', props: { [DIRECTOR_PROP]: { v: 1, fps: 30, build: { plan: { sections: [] }, spans: [{ from: 0, to: 4 }, { from: 4, to: 8 }], builds: 1 } } } } as never;
const directed = reviewMoments({ fps: 30, items: [canvas, clip('a', 'V2', 0, 1), clip('b', 'V2', 1, 2)] }, 8);
assert.deepEqual(directed.map((m) => m.label), ['hook·0.3', 's0·1.8', 'cut·4.0', 's1·5.8', 'end·8.0']);

// a long reel keeps the hook, the end and 30 cells between
const many = Array.from({ length: 60 }, (_, i) => clip(`c${i}`, 'V1', i, i + 1));
const capped = reviewMoments({ fps: 30, items: many }, 60);
assert.equal(capped.length, 32);
assert.match(capped[0]!.label, /^hook/);
assert.match(capped.at(-1)!.label, /^end/);
assert.equal(sheetSidecarName('My reel.mp4', 0), 'My reel.sheet.jpg');
assert.equal(sheetSidecarName('My reel.mp4', 1), 'My reel.sheet-2.jpg');

// nothing exported yet
assert.match((reviewExportTool() as { error: string }).error, /export/);

// delivery: the sheet from the rendered file is written next to the video and kept for the agent
const written: string[] = [];
let asked: unknown;
const tiny = btoa('jpeg');
const fetcher = (async (_url: string, init: RequestInit) => { asked = JSON.parse(String(init.body)); return Response.json({ sheets: [{ base64: tiny, labels: [] }], skipped: [] }); }) as unknown as typeof fetch;
const out = await deliverReviewSheet({
  state: { fps: 30, items: [clip('a', 'V1', 0, 2), clip('b', 'V1', 2, 5)] }, src: '/media/uploads/render.mp4', seconds: 5, videoName: 'Trek.mp4',
  checks: [{ id: 'V10', status: 'WARN', detail: 'frozen at 2.0-3.0s' }], save: true, write: async (n) => { written.push(n); }, fetcher,
});
assert.equal(out.status, 'written');
assert.deepEqual(written, ['Trek.sheet.jpg']);
assert.equal((asked as { items: Array<{ src: string }> }).items[0]!.src, '/media/uploads/render.mp4');
const seen = reviewExportTool() as Record<string, any>;
assert.equal(seen.__images.length, 1);
assert.deepEqual(seen.checks, ['V10 WARN: frozen at 2.0-3.0s']);
assert.match(seen.sheet, /Saved next to the video as Trek\.sheet\.jpg/);
assert.match(seen.next, /reels_director_fix/);

// sheet off: kept for the agent, nothing written; a failed sheet never throws
written.length = 0;
assert.equal((await deliverReviewSheet({ state: { fps: 30, items: [] }, src: '/x', seconds: 2, videoName: 'a.mp4', checks: [], save: false, write: async (n) => { written.push(n); }, fetcher })).status, 'kept');
assert.deepEqual(written, []);
const failed = await deliverReviewSheet({ state: { fps: 30, items: [] }, src: '/x', seconds: 2, videoName: 'a.mp4', checks: [], save: true, write: async () => {}, fetcher: (async () => Response.json({ error: 'no usable items' }, { status: 500 })) as unknown as typeof fetch });
assert.equal(failed.status, 'failed');
assert.equal(exportReviewStore.get()!.sheets.length, 0);
console.log('exportReview.verify ok');
