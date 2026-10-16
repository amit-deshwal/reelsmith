import assert from 'node:assert/strict';
import { placeInSlot } from '../editor/layouts';
import { FILL_LAYOUTS, cellAt, fillSlots, freeVideoTrack } from './layoutFill';

for (const { id } of FILL_LAYOUTS) {
  const slots = fillSlots(id);
  assert.ok(slots.length >= 2, id);
  // the cells tile the canvas, and every cell is a valid slot a clip can be placed in
  assert.ok(Math.abs(slots.reduce((a, s) => a + s.w * s.h, 0) - 1) < 1e-9, `${id} covers the canvas`);
  slots.forEach((s, i) => {
    assert.doesNotThrow(() => placeInSlot(s, 'cover'));
    assert.equal(cellAt(id, s.x + s.w / 2, s.y + s.h / 2), i, `${id} cell ${i} hit at its centre`);
  });
}
assert.equal(cellAt('grid2x2', 0.75, 0.25), 1);
assert.equal(cellAt('grid2x2', 0.25, 0.75), 2);
assert.equal(cellAt('split3v', 0.5, 0.9), 2);
assert.equal(cellAt('split2v', 1.2, 0.5), -1);
const it = (track: string, startFrame: number, durationInFrames: number) => ({ track, startFrame, durationInFrames }) as never;
const st = (items: never[]) => ({ items, tracks: {}, trackOrder: ['V2', 'V1', 'A1'] }) as never;
assert.equal(freeVideoTrack(st([]), 0, 100), 'V1', 'empty: lowest video track');
assert.equal(freeVideoTrack(st([it('V1', 0, 150)]), 30, 130), 'V2', 'V1 busy, V2 free');
assert.equal(freeVideoTrack(st([it('V1', 0, 150), it('V2', 100, 50)]), 30, 130), null, 'every video track busy');
assert.equal(freeVideoTrack(st([it('V1', 0, 50)]), 50, 120), 'V1', 'touching clips do not overlap');
console.log('layoutFill.verify ok');
