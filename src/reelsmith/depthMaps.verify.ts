import assert from 'node:assert/strict';
import type { TimelineItem } from '../editor/types';
import { depthRequestFor, requestDepthMap, wantsDepth, withDepthMap, withDepthMaps } from './depthMaps';

const fx = [{ id: 'fx1', assetId: 'builtin:fx-photo-parallax', overrides: { move: 1 } }];
const photo = { id: 'p1', track: 'V1', kind: 'image', name: 'view', src: '/media/uploads/view.jpg', startFrame: 0, durationInFrames: 90, effects: fx } as unknown as TimelineItem;
const video = { ...photo, id: 'v1', kind: 'video', src: '/media/uploads/trail.mp4', srcInFrame: 45 } as unknown as TimelineItem;
const plain = { ...photo, id: 'p2', effects: [{ id: 'g', assetId: 'builtin:fx-film-grain', overrides: {} }] } as unknown as TimelineItem;

assert.ok(wantsDepth(photo) && wantsDepth(video));
assert.ok(!wantsDepth(plain));
assert.deepEqual(depthRequestFor(photo, 30), { src: '/media/uploads/view.jpg' });
// a steady shot's map is made from the frame where the clip starts
assert.deepEqual(depthRequestFor(video, 30), { src: '/media/uploads/trail.mp4', atSec: 1.5 });

const asked: string[] = [];
const fetcher = async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body)) as { src: string };
  asked.push(body.src);
  return { ok: true, json: async () => (body.src.includes('missing') ? { available: false } : { available: true, src: body.src.replace(/\.\w+$/, '.depth.png') }) };
};

// the clip carries its map; one that has one, or needs none, is returned as it was
const withMap = await withDepthMap(photo, 30, fetcher);
assert.equal(withMap.props?.rsDepthSrc, '/media/uploads/view.depth.png');
assert.equal(await withDepthMap(withMap, 30, fetcher), withMap);
assert.equal(await withDepthMap(plain, 30, fetcher), plain);
// asked once per photo, however many clips show it
asked.length = 0;
await requestDepthMap({ src: '/media/uploads/view.jpg' }, fetcher);
assert.equal(asked.length, 0);
// no pack: nothing attached, and asked again next time (it may be installed by then)
const missing = { ...photo, id: 'p3', src: '/media/uploads/missing.jpg' } as unknown as TimelineItem;
assert.equal(await withDepthMap(missing, 30, fetcher), missing);
await withDepthMap(missing, 30, fetcher);
assert.equal(asked.filter((s) => s.includes('missing')).length, 2);

// an export's state: the timeline and its nested sequences get their maps; untouched parts keep their identity
const nested = { id: 's1', fps: 25, items: [{ ...video, id: 'v2', srcInFrame: 50 }] };
const state = { fps: 30, items: [photo, plain], sequenceTimelines: { s1: nested }, captions: { lines: [] } };
const out = await withDepthMaps(state, fetcher);
assert.notEqual(out, state);
assert.equal(out.items[0]!.props?.rsDepthSrc, '/media/uploads/view.depth.png');
assert.equal(out.items[1], plain);
assert.equal(out.captions, state.captions);
assert.equal((out.sequenceTimelines.s1.items[0] as TimelineItem).props?.rsDepthSrc, '/media/uploads/trail.depth.png');
const already = { fps: 30, items: [plain] };
assert.equal(await withDepthMaps(already, fetcher), already);
console.log('depthMaps.verify: ok');
