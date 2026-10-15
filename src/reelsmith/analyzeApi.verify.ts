import assert from 'node:assert/strict';
import { createAnalyzeApi } from './analyzeApi';
import type { MediaAsset } from '../editor/types';
import type { ClipFeatures } from './assembler/scoring';

const asset: MediaAsset = { id: 'photo', src: '/media/uploads/photo.png', name: 'Photo', kind: 'image', durationInFrames: 150 };
const features: ClipFeatures = { assetId: asset.id, dHash: '0123456789abcdef', captureTimeMs: 123, windows: [
  { startFrame: 0, endFrame: 30, sharpness: 0.5, exposure: 0.5, motion: 0, subject: 0, speech: false },
] };
const fetcher: typeof fetch = async (url, init) => {
  assert.equal(url, '/api/reelsmith/clip-features', 'only the local analysis endpoint is used');
  assert.deepEqual(JSON.parse(init!.body as string), { src: asset.src, assetId: asset.id, kind: 'image', fps: 30 });
  return Response.json({ features });
};
const api = createAnalyzeApi(fetcher, async () => ({ assetId: asset.id, sourceRevision: 'v1', algorithmVersion: 'test', durationSec: 1, segments: [
  { startSec: 0, endSec: 1, person: 'center', zone: { rects: [], subject: null, face: { x: 0.2, y: 0.1, w: 0.5, h: 0.5 } } },
] }));
const result = await api.clipFeatures(asset, 30);
assert.ok(Math.abs(result!.windows[0]!.face! - 0.25) < 1e-12);
assert.equal(result!.captureTimeMs, 123);
assert.equal(result!.dHash, features.dHash);
const unavailable = createAnalyzeApi(fetcher, async () => { throw new Error('Models unavailable'); });
assert.deepEqual(await unavailable.clipFeatures(asset, 30), features, 'model failure keeps deterministic local features');
assert.equal(await createAnalyzeApi(async () => new Response('', { status: 503 }), async () => null).clipFeatures(asset, 30), null);
console.log('analyzeApi.verify: ok');
