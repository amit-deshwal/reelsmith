import assert from 'node:assert/strict';
import type { VisualGeometryAsset } from '../geometry/visual-geometry';
import { analyzeSubjects, mergeSubjectFeatures } from './subjectFeatures';
import { scoreWindow, type ClipFeatures } from './assembler/scoring';

const features: ClipFeatures = { assetId: 'a', dHash: '0123456789abcdef', windows: [0, 60].map((startFrame) => ({
  startFrame, endFrame: startFrame + 60, sharpness: 0.5, exposure: 0.5, motion: 0.2, subject: 0, speech: false,
})) };
const geometry: VisualGeometryAsset = { assetId: 'a', sourceRevision: 'rev', algorithmVersion: 'mediapipe-v2', durationSec: 4, segments: [
  { startSec: 0, endSec: 1, person: 'none', zone: { rects: [], face: null, subject: null } },
  { startSec: 1, endSec: 2, person: 'center', zone: { rects: [], face: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, subject: null } },
  { startSec: 2, endSec: 4, person: 'none', zone: { rects: [], face: null, subject: null } },
] };
const merged = mergeSubjectFeatures(features, geometry, 30);
assert.equal(merged.windows[0]!.face, 0.125, 'face area weighted by half-window occupancy');
assert.equal(merged.windows[1]!.face, 0, 'a face in another shot does not affect this window');
assert.ok(scoreWindow(merged.windows[0]!) > scoreWindow(merged.windows[1]!), 'a detected face contributes to selection');
assert.equal(features.windows[0]!.face, undefined, 'input remains immutable');
assert.equal(mergeSubjectFeatures(features, null, 30), features, 'missing models preserve model-free analysis');
assert.equal(mergeSubjectFeatures(features, { ...geometry, assetId: 'different' }, 30), features);
const badBox = mergeSubjectFeatures(features, { ...geometry, segments: [{ ...geometry.segments[1]!, startSec: 0, endSec: 2,
  zone: { rects: [], subject: null, face: { x: NaN, y: 0, w: 1, h: 1 } } }] }, 30);
assert.equal(badBox.windows[0]!.face, 0);
assert.equal(await analyzeSubjects({ id: 'a', name: 'a', src: '/media/uploads/a.mp4', kind: 'video', durationInFrames: 120 }), null,
  'headless runs keep working without browser inference');
console.log('subjectFeatures.verify: ok');
