import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { activeTimeline } from '../editor/types';
import { canSubjectReframe, fillCanvasActions, framingOrigin, originCentringSubject, reframeBatchActions } from './subjectReframe';

const WIDE = { src: 16 / 9, dst: 9 / 16 };

let h: History = { past: [], present: emptyProjectDoc(), future: [] };
const video = { id: 'v', track: 'V1', kind: 'video' as const, name: 'wide', src: '/w.mp4', durationInFrames: 120 };
h = historyReduce(h, { type: 'add', startFrame: 0, item: video } as never);
const item = () => activeTimeline(h.present).items.find((i) => i.id === 'v')!;
assert.ok(canSubjectReframe(item()));
assert.equal(canSubjectReframe({ ...item(), kind: 'image' }), false);
assert.equal(canSubjectReframe({ ...item(), src: undefined }), false);

const first = [0, 30, 60].map((frame, i) => ({ frame, focalPointX: 0.3 + i * 0.1, focalPointY: 0.5, magnification: 3.16 }));
const before = h.past.length;
h = historyReduce(h, { type: 'batch', label: 'Reframe to subject', actions: reframeBatchActions(item(), first, WIDE) });
assert.equal(h.past.length, before + 1, 'one undo step');
assert.deepEqual(item().zoom?.reframeCurve?.keyframes.map((k) => k.frame), [0, 30, 60]);

// re-running replaces the old curve instead of stacking
const second = [10, 50].map((frame) => ({ frame, focalPointX: 0.8, focalPointY: 0.5, magnification: 3.16 }));
h = historyReduce(h, { type: 'batch', label: 'Reframe to subject', actions: reframeBatchActions(item(), second, WIDE) });
assert.deepEqual(item().zoom?.reframeCurve?.keyframes.map((k) => k.frame), [10, 50]);
h = historyReduce(h, { type: 'undo' } as never);
assert.deepEqual(item().zoom?.reframeCurve?.keyframes.map((k) => k.frame), [0, 30, 60], 'undo restores the previous curve');

// origin maths: the subject lands at the canvas centre after zooming, and the picture still covers the canvas
const m = 3.16;
for (const p of [0.2, 0.3, 0.5, 0.7, 0.8]) {
  const o = originCentringSubject(p, m);
  assert.ok(o >= 0 && o <= 1);
  const landed = o + m * (p - o);
  assert.ok(Math.abs(landed - 0.5) < 1e-9 || o === 0 || o === 1, `subject at ${p} is centred unless clamped`);
}
assert.ok(Math.abs(originCentringSubject(0.3, m) - 0.2074) < 1e-3, 'worked example');
assert.equal(originCentringSubject(0.5, m), 0.5);
assert.equal(originCentringSubject(0.05, m), 0, 'a subject near the edge clamps so no gap opens');
assert.equal(originCentringSubject(0.4, 1), 0.5, 'no zoom, no move');
const k = { frame: 0, focalPointX: 0.3, focalPointY: 0.1, magnification: m };
assert.equal(framingOrigin(k, 16 / 9, 9 / 16).y, 0.5, 'wide source: the filled (vertical) axis stays centred');
assert.notEqual(framingOrigin(k, 16 / 9, 9 / 16).x, 0.5);
assert.equal(framingOrigin(k, 9 / 16, 16 / 9).x, 0.5, 'tall source: the filled (horizontal) axis stays centred');
assert.notEqual(framingOrigin(k, 9 / 16, 16 / 9).y, 0.5);

// centre fill: 16:9 into 9:16 needs 3.16x, drops any old curve, in one undo step, and 1080p->9:16 is exact
const fill = fillCanvasActions(item(), 1920, 1080, 9 / 16);
const beforeFill = h.past.length;
h = historyReduce(h, { type: 'batch', label: 'Fill canvas', actions: fill });
assert.equal(h.past.length, beforeFill + 1);
assert.ok(Math.abs((item().transform?.scaleX ?? 0) - 3.1605) < 1e-3, `scale ${item().transform?.scaleX}`);
assert.equal(item().zoom?.reframeCurve?.keyframes.length ?? 0, 0, 'old reframe curve removed');
const same = fillCanvasActions(item(), 1080, 1920, 9 / 16).find((a) => a.type === 'setTransform') as { patch: { scale: number } };
assert.equal(same.patch.scale, 1, 'already 9:16: nothing to fill');
console.log('subjectReframe.verify: ok');
