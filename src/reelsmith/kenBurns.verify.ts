import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { activeTimeline } from '../editor/types';
import { KEN_BURNS, pictureExtent, KEN_BURNS_ORDER, canKenBurns, clearKenBurnsActions, kenBurnsActions } from './kenBurns';

let h: History = { past: [], present: emptyProjectDoc(), future: [] };
h = historyReduce(h, { type: 'add', startFrame: 0, item: { id: 'p', track: 'V1', kind: 'image', name: 'photo', src: '/p.jpg', durationInFrames: 90 } } as never);
const item = () => activeTimeline(h.present).items.find((i) => i.id === 'p')!;
assert.ok(canKenBurns(item()));
assert.equal(canKenBurns({ kind: 'video' }), false);
assert.equal(canKenBurns({ kind: 'text' }), false);

for (const preset of KEN_BURNS_ORDER) {
  const before = h.past.length;
  h = historyReduce(h, { type: 'batch', label: KEN_BURNS[preset].label, actions: kenBurnsActions(item(), preset) });
  assert.equal(h.past.length, before + 1, `${preset}: one undo step`);
  const ks = item().zoom!.reframeCurve!.keyframes;
  assert.deepEqual(ks.map((k) => k.frame), [0, 89], `${preset}: keys at first and last frame (re-applying replaces)`);
  assert.equal(ks[0]!.magnification, KEN_BURNS[preset].from.m);
  assert.equal(ks[1]!.focalPointX, KEN_BURNS[preset].to.x);
  for (const k of ks) assert.ok(k.magnification >= 1 && k.focalPointX >= 0 && k.focalPointX <= 1 && k.focalPointY >= 0 && k.focalPointY <= 1);
}
h = historyReduce(h, { type: 'undo' } as never);
assert.equal(item().zoom!.reframeCurve!.keyframes[0]!.focalPointY, KEN_BURNS['drift-up'].from.y, 'undo restores the previous preset');
h = historyReduce(h, { type: 'batch', label: 'Clear', actions: clearKenBurnsActions(item()) });
assert.equal(item().zoom?.reframeCurve, undefined, 'clear removes the motion');

// Contain-fitted pictures of another shape: every preset keeps the picture covering the canvas through the whole move
// (zoom about the canvas point (fx, fy), as TimelineMediaLayer draws it).
const canvas = { width: 1080, height: 1920 };
const shapes = [{ width: 4000, height: 3000 }, { width: 1920, height: 1080 }, { width: 3000, height: 4000 }, { width: 1080, height: 1080 }, { width: 1080, height: 1920 }];
const covers = (pos: number, extent: number, m: number): boolean => {
  const top = pos + ((1 - extent) / 2 - pos) * m;
  const bottom = pos + ((1 + extent) / 2 - pos) * m;
  return top <= 1e-9 && bottom >= 1 - 1e-9;
};
for (const src of shapes) {
  const fit = pictureExtent(src, canvas);
  for (const preset of KEN_BURNS_ORDER) {
    const keys = kenBurnsActions({ id: 'x', durationInFrames: 90 } as never, preset, { src, canvas }).filter((a) => a.type === 'reframeKeyframe') as Array<{ focalPointX: number; focalPointY: number; magnification: number }>;
    assert.equal(keys.length, 2);
    for (let t = 0; t <= 1; t += 0.125) {
      const f = (a: number, b: number) => a + (b - a) * t;
      const m = f(keys[0]!.magnification, keys[1]!.magnification);
      if (fit) {
        const pos = fit.axis === 'x' ? f(keys[0]!.focalPointX, keys[1]!.focalPointX) : f(keys[0]!.focalPointY, keys[1]!.focalPointY);
        assert.ok(covers(pos, fit.extent, m), `${preset} on ${src.width}x${src.height} at t=${t}: bands`);
      }
      assert.ok(m >= 1 - 1e-9);
    }
  }
}
assert.equal(pictureExtent({ width: 1080, height: 1920 }, canvas), null, 'matching shape: unchanged');
assert.equal(pictureExtent({}, canvas), null, 'unknown size keeps the old behaviour');
assert.equal(pictureExtent({ width: 4000, height: 3000, transform: { scale: (4 / 3) / (9 / 16) } }, canvas), null, 'a fill transform already covers it');
const unchanged = kenBurnsActions({ id: 'x', durationInFrames: 90 } as never, 'push-in', { src: { width: 4000, height: 3000, transform: { scale: 3 } }, canvas }) as Array<{ magnification?: number }>;
assert.equal(unchanged.at(-1)!.magnification, KEN_BURNS['push-in'].to.m, 'no extra zoom on a clip that already fills the canvas');
console.log('kenBurns.verify ok');
