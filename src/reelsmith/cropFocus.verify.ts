import assert from 'node:assert/strict';
import { cropPositionForFocus, fillTransformForFocus, focusRetention } from './cropFocus';
import { mismatchFitOf, withCropFocus } from './runRecipe';
import type { AssemblyClip } from './assembler/types';

const rightFace = { x: 0.78, y: 0.35, w: 0.12, h: 0.18 };
const p = cropPositionForFocus(1920, 1080, 9 / 16, rightFace);
assert.ok(p.x > 0.8 && p.y === 0.5, 'portrait crop follows a face on the right of landscape footage');
assert.equal(focusRetention(1920, 1080, 9 / 16, rightFace), 1);
const highFace = { x: 0.35, y: 0.08, w: 0.2, h: 0.12 };
const q = cropPositionForFocus(1080, 1920, 16 / 9, highFace);
assert.ok(q.y < 0.2 && q.x === 0.5, 'landscape crop follows a high face in portrait footage');
assert.deepEqual(cropPositionForFocus(0, 0, 9 / 16, rightFace), { x: 0.5, y: 0.5 });

const clip: AssemblyClip = {
  assetId: 'clip', name: 'clip', src: '/clip.mp4', kind: 'video', width: 1920, height: 1080,
  durationInFrames: 180, score: 1,
  sourceAnalysis: { minShotFrames: 15, shotBoundariesFrame: [], windows: [
    { startFrame: 0, endFrame: 90, score: 0.9, focusRect: { x: 0.1, y: 0.35, w: 0.12, h: 0.18 } },
    { startFrame: 90, endFrame: 180, score: 0.9, focusRect: rightFace },
  ] },
};
const actions = withCropFocus([{ type: 'add', startFrame: 0, item: {
  id: 'shot', track: 'V1', kind: 'video', name: 'shot', src: '/clip.mp4', sourceAssetId: 'clip',
  srcInFrame: 105, durationInFrames: 50, props: { rsSection: 'body' },
} }], [clip], { width: 1080, height: 1920 });
const action = actions[0]!;
assert.equal(action.type, 'add');
if (action.type === 'add') {
  assert.equal(action.item.width, 1920);
  assert.equal(action.item.props?.rsSection, 'body');
  const transform = action.item.transform!;
  assert.ok(Math.abs(Number(transform.scale) - (16 / 9) / (9 / 16)) < 1e-9, 'fills a 9:16 canvas with the 16:9 clip');
  assert.equal(transform.scaleX, transform.scale);
  assert.ok(Number(transform.x) < -100, 'pans toward the right-hand face in the window actually placed on the timeline');
}
// Fill: the picture must cover the canvas edge to edge for any focus, on both axes.
const covers = (t: { scale: number; x: number; y: number }, canvasAspect: number, srcAspect: number) => {
  const cx = 0.5 + t.x / 100; const cy = 0.5 + t.y / 100;
  const extentW = srcAspect > canvasAspect ? t.scale : 1; const extentH = srcAspect > canvasAspect ? 1 : t.scale;
  return cx - extentW / 2 <= 1e-9 && cx + extentW / 2 >= 1 - 1e-9 && cy - extentH / 2 <= 1e-9 && cy + extentH / 2 >= 1 - 1e-9;
};
assert.equal(fillTransformForFocus(1080, 1920, 1080, 1920, rightFace), null, 'matching aspect keeps the normal fit');
assert.equal(fillTransformForFocus(0, 0, 1080, 1920, rightFace), null, 'unknown source size keeps the normal fit');
const centred = fillTransformForFocus(1920, 1080, 1080, 1920, { x: 0.45, y: 0.4, w: 0.1, h: 0.2 })!;
assert.ok(Math.abs(centred.x) < 1e-9 && centred.y === 0, 'a centred subject is not panned');
assert.ok(covers(centred, 9 / 16, 16 / 9), 'landscape in portrait covers the canvas');
for (const [w, h, cw, ch, focus] of [
  [1920, 1080, 1080, 1920, rightFace],
  [1920, 1080, 1080, 1920, { x: 0.02, y: 0.4, w: 0.1, h: 0.2 }],
  [1080, 1920, 1920, 1080, highFace],
  [1080, 1920, 1080, 1080, undefined],
  [1080, 1920, 1920, 1080, { x: 0.9, y: 0.9, w: 0.1, h: 0.1 }],
] as const) {
  const t = fillTransformForFocus(w, h, cw, ch, focus)!;
  assert.ok(covers(t, cw / ch, w / h), `no empty pixels for ${w}x${h} in ${cw}x${ch} with focus ${JSON.stringify(focus)}`);
}
const faceOn = fillTransformForFocus(1920, 1080, 1080, 1920, rightFace)!;
assert.ok(0.5 + faceOn.x / 100 - faceOn.scale / 2 <= 0 && faceOn.x < -100, 'a right-hand face pulls the window to the right');
const slotted = withCropFocus([{ type: 'add', startFrame: 0, item: {
  id: 'cell', track: 'V1', kind: 'video', name: 'cell', src: '/clip.mp4', sourceAssetId: 'clip',
  srcInFrame: 105, durationInFrames: 50, transform: { x: 10, y: 0, scale: 0.5 },
} }], [clip], { width: 1080, height: 1920 });
assert.deepEqual(slotted[0]!.type === 'add' ? slotted[0]!.item.transform : null, { x: 10, y: 0, scale: 0.5 }, 'slot-placed clips keep their own transform');
// RS-903: "fit whole over a blurred background" keeps the picture uncropped and turns on the editor's background fill
const blurred = withCropFocus([{ type: 'add', startFrame: 0, item: {
  id: 'shot', track: 'V1', kind: 'video', name: 'shot', src: '/clip.mp4', sourceAssetId: 'clip',
  srcInFrame: 105, durationInFrames: 50,
} }], [clip], { width: 1080, height: 1920 }, 'blur')[0]!;
assert.ok(blurred.type === 'add' && blurred.item.backgroundFill === true && !blurred.item.transform, 'blur: background fill, no crop transform');
assert.equal(mismatchFitOf({}), 'auto');
assert.equal(mismatchFitOf({ mismatchFit: 'blur' }), 'blur');
assert.equal(mismatchFitOf({ mismatchFit: 'fill' }), 'fill');
assert.equal(mismatchFitOf({ mismatchFit: 'nonsense' }), 'auto');
// automatic: a sharp 12 MP landscape photo is cropped to fill; a small one (cover crop would enlarge it past 2x) is fitted whole over blur
const autoFor = (width: number, height: number, kind: 'image' | 'video' = 'image') => {
  const a = withCropFocus([{ type: 'add', startFrame: 0, item: { id: 'p', track: 'V1', kind, name: 'p', src: '/p', sourceAssetId: 'p', durationInFrames: 30 } }],
    [{ ...clip, assetId: 'p', kind, width, height, sourceAnalysis: undefined }], { width: 1080, height: 1920 }, 'auto')[0]!;
  return a.type === 'add' ? a.item : null;
};
assert.ok(autoFor(4000, 3000)!.transform && !autoFor(4000, 3000)!.backgroundFill, '12 MP landscape photo: crop to fill');
assert.ok(autoFor(1920, 1080, 'video')!.transform, '1080p landscape video (1.8x): crop to fill');
assert.ok(autoFor(800, 600)!.backgroundFill === true && !autoFor(800, 600)!.transform, 'small 800x600 photo (3.2x): blurred fit');
assert.ok(autoFor(1280, 720, 'video')!.backgroundFill === true, '720p landscape video (2.7x): blurred fit');
console.log('cropFocus.verify: ok');
