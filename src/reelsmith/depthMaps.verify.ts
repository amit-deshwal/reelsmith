import assert from 'node:assert/strict';
import type { TimelineItem } from '../editor/types';
import { depthRequestFor, depthTrackRequestFor, requestDepthMap, wantsDepth, wantsDepthTrack, wantsStillDepth, withDepthMap, withDepthMaps } from './depthMaps';

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

// RS-1260: a video with lens blur gets a depth track of the span it shows, not a still map; a photo with lens blur the still map
const blurFx = [{ id: 'lb', assetId: 'builtin:fx-lens-blur', overrides: {} }];
const blurVideo = { ...video, id: 'v3', src: '/media/uploads/walk.mp4', effects: blurFx, srcInFrame: 30, durationInFrames: 61, playbackRate: 1 } as unknown as TimelineItem;
const blurPhoto = { ...photo, id: 'p4', effects: blurFx } as unknown as TimelineItem;
assert.ok(wantsDepthTrack(blurVideo) && !wantsStillDepth(blurVideo));
assert.ok(!wantsDepthTrack(blurPhoto) && wantsStillDepth(blurPhoto));
assert.ok(!wantsDepthTrack(video) && wantsStillDepth(video), 'photo parallax on a video keeps its one map');
assert.deepEqual(depthTrackRequestFor(blurVideo, 30), { src: '/media/uploads/walk.mp4', fromSec: 1, toSec: 3 });
// at half speed the clip shows half as much of its source
assert.deepEqual(depthTrackRequestFor({ ...blurVideo, playbackRate: 0.5 } as TimelineItem, 30), { src: '/media/uploads/walk.mp4', fromSec: 1, toSec: 2 });
const trackAsked: Array<{ url: string; body: Record<string, unknown> }> = [];
const trackFetcher = async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  trackAsked.push({ url, body });
  return { ok: true, json: async () => ({ available: true, src: url.endsWith('/depth-track') ? '/media/uploads/walk.depthv-1000-3000.png' : '/media/uploads/x.depth.png' }) };
};
const tracked = await withDepthMap(blurVideo, 30, trackFetcher);
assert.equal(tracked.props?.rsDepthTrackSrc, '/media/uploads/walk.depthv-1000-3000.png');
assert.equal(tracked.props?.rsDepthSrc, undefined);
assert.deepEqual(trackAsked.map((a) => a.url), ['/api/reelsmith/depth-track']);
assert.equal(await withDepthMap(tracked, 30, trackFetcher), tracked);
// lens blur and a sky effect on one video: one track serves both (RS-1261: the sky of every frame is saved with it)
const both = await withDepthMap({ ...blurVideo, id: 'v4', src: '/media/uploads/walk2.mp4', effects: [...blurFx, { id: 's', assetId: 'builtin:fx-sky-recover', overrides: {} }] } as unknown as TimelineItem, 30, trackFetcher);
assert.ok(both.props?.rsDepthTrackSrc && !both.props?.rsDepthSrc);
// a sky effect alone on a video asks for the track, not a still map
const skyOnly = await withDepthMap({ ...blurVideo, id: 'v5', src: '/media/uploads/walk3.mp4', effects: [{ id: 's', assetId: 'builtin:fx-sky-recover', overrides: {} }] } as unknown as TimelineItem, 30, trackFetcher);
assert.ok(skyOnly.props?.rsDepthTrackSrc && !skyOnly.props?.rsDepthSrc);
console.log('depthMaps.verify: ok');
