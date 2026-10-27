import assert from 'node:assert/strict';
import { DIRECTOR_PROP } from './director/directorSession';
import { coverMoment, coverSidecarName, deliverCover, quietestBand, titleLayout, wrapTitle } from './exportCover';

// RS-1234: the cover is the longest section with no line on it, titled with the reel's opening line
const canvas = (sections: unknown[], spans: Array<{ from: number; to: number }>, overlays: unknown[] = []) => ({
  id: 'c', track: 'V1', kind: 'solid', startFrame: 0, durationInFrames: 600, name: 'canvas',
  props: { [DIRECTOR_PROP]: { v: 1, fps: 30, build: { plan: { version: 1, ratio: '9:16', sections, overlays }, spans, builds: 1 } } },
}) as never;
const spans = [{ from: 0, to: 2 }, { from: 2, to: 6 }, { from: 6, to: 7 }, { from: 7, to: 10 }];
const sections = [{ move: 'hold', text: 'Two days on the trek' }, { move: 'hold', text: 'it rained' }, { move: 'cut' }, { move: 'velocity' }];
assert.deepEqual(coverMoment({ fps: 30, items: [canvas(sections, spans)] }, 10), { atSec: 8.35, title: 'Two days on the trek' });
// an overlay across sections 2-3 puts a line on them too; then only lined sections remain → the hook, no title
assert.deepEqual(coverMoment({ fps: 30, items: [canvas(sections, spans, [{ text: 'summit', style: 'x', from: 2, to: 3 }])] }, 10), { atSec: 0.9 });
// a reel the director did not make: the middle of its longest shot, no title
const clip = (from: number, to: number) => ({ id: `${from}`, track: 'V1', kind: 'video', startFrame: from * 30, durationInFrames: (to - from) * 30, name: 'x' }) as never;
assert.deepEqual(coverMoment({ fps: 30, items: [clip(0, 1), clip(1, 5), clip(5, 6)] }, 6), { atSec: 2.8 });

assert.equal(coverSidecarName('Trek reel.mp4'), 'Trek reel.cover.jpg');
assert.deepEqual(wrapTitle('2 days on the toughest trek in Maharashtra', 16), ['2 days on the', 'toughest trek in', 'Maharashtra']);
assert.deepEqual(wrapTitle('Harishchandragadfort', 16), ['Harishchandragadfort']);
// the title block sits inside the 3:4 crop the profile grid shows (9:16 and 4:5 canvases)
for (const [w, h] of [[1080, 1920], [1080, 1350]] as const) {
  for (const [lines, at] of [1, 2, 3, 4].flatMap((n) => [0.2, 0.5, 0.8].map((b) => [n, b] as const))) {
    const L = titleLayout(w, h, lines, at);
    assert.ok(L.firstBaseline - L.size >= L.gridTop && L.firstBaseline + (lines - 1) * L.lineHeight + L.size * 0.3 <= L.gridBottom, `${w}x${h} ${lines} lines`);
  }
}

// the title goes to the calmest third: flat sky over a busy group → the top; busy all over → the middle
const frame = (busy: (y: number) => boolean, w = 54, h = 96) => Array.from({ length: w * h }, (_, i) => (busy(Math.floor(i / w)) ? ((i * 7919) % 255) : 128));
assert.equal(quietestBand(frame((y) => y > 30), 54, 96), 0.2);
assert.equal(quietestBand(frame((y) => y < 60), 54, 96), 0.8);
assert.equal(quietestBand(frame(() => true), 54, 96), 0.5);
assert.equal(quietestBand(frame(() => false), 54, 96), 0.5);

// delivery: the frame from the exported file, drawn and written next to the video; failures never throw
let asked: unknown, drawn: unknown;
const written: string[] = [];
const ok = await deliverCover({
  state: { fps: 30, items: [canvas(sections, spans)] }, src: '/media/uploads/render.mp4', seconds: 10, videoName: 'Trek.mp4',
  write: async (n) => { written.push(n); },
  fetcher: (async (_u: string, init: RequestInit) => { asked = JSON.parse(String(init.body)); return Response.json({ base64: 'AA==', width: 1080, height: 1920 }); }) as unknown as typeof fetch,
  draw: async (b64, title) => { drawn = { b64, title }; return new Blob(['x']); },
});
assert.equal(ok.status, 'written');
assert.deepEqual(asked, { src: '/media/uploads/render.mp4', atSec: 8.35 });
assert.deepEqual(drawn, { b64: 'AA==', title: 'Two days on the trek' });
assert.deepEqual(written, ['Trek.cover.jpg']);
const bad = await deliverCover({ state: { fps: 30, items: [] }, src: '/x', seconds: 2, videoName: 'a.mp4', write: async () => {}, fetcher: (async () => Response.json({ error: 'nope' }, { status: 500 })) as unknown as typeof fetch });
assert.deepEqual(bad, { status: 'failed', message: 'nope' });
console.log('exportCover.verify ok');
