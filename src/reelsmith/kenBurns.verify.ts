import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { activeTimeline } from '../editor/types';
import { coverScale, KEN_BURNS, KEN_BURNS_ORDER, canKenBurns, clearKenBurnsActions, kenBurnsActions } from './kenBurns';

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
console.log('kenBurns.verify ok');

// a landscape photo in a 9:16 canvas starts already covering it; a matching shape is unchanged
assert.ok(Math.abs(coverScale({ width: 4000, height: 3000 }, { width: 1080, height: 1920 }) - (4 / 3) / (9 / 16)) < 1e-9);
assert.ok(Math.abs(coverScale({ width: 3000, height: 4000 }, { width: 1920, height: 1080 }) - (16 / 9) / (3 / 4)) < 1e-9);
assert.equal(coverScale({ width: 1080, height: 1920 }, { width: 1080, height: 1920 }), 1);
assert.equal(coverScale({}, { width: 1080, height: 1920 }), 1, 'unknown size keeps the old behaviour');
{
  const ks = kenBurnsActions({ ...item(), id: 'i' }, 'push-in', { src: { width: 4000, height: 3000 }, canvas: { width: 1080, height: 1920 } }) as Array<{ type: string; magnification?: number }>;
  const mags = ks.filter((k) => k.type === 'reframeKeyframe').map((k) => k.magnification!);
  assert.ok(mags.every((m) => m >= coverScale({ width: 4000, height: 3000 }, { width: 1080, height: 1920 }) - 1e-9), 'every keyframe covers the canvas');
}
