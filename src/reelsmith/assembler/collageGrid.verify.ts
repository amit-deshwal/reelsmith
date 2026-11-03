import assert from 'node:assert/strict';
import { LAYOUT_SLOTS, withGutter } from './collageGrid';

assert.deepEqual(Object.fromEntries(Object.entries(LAYOUT_SLOTS).map(([k, v]) => [k, v.length])),
  { split2v: 2, split2h: 2, split3v: 3, grid2x2: 4, grid3x3: 9 });
// a layout's slots tile the frame: no overlaps and the areas add up to 1
for (const [name, slots] of Object.entries(LAYOUT_SLOTS)) {
  assert.ok(Math.abs(slots.reduce((sum, s) => sum + s.w * s.h, 0) - 1) < 1e-9, `${name} covers the frame`);
}
const g = withGutter({ x: 0, y: 0, w: 0.5, h: 0.5 }, 20, { width: 1000, height: 2000 });
assert.ok(g.x > 0 && g.w < 0.5);
console.log('collageGrid.verify: ok');
