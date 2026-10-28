import assert from 'node:assert/strict';
import { depthDetail, visibleWindow } from './depthView';

const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-3);
// a picture that fills the canvas exactly: all of it on screen, drawn at its own size
assert.deepEqual(visibleWindow({}, 1080, 1920, 1080, 1920), [0, 0, 1, 1]);
assert.equal(depthDetail({}, 1080, 1920), 1);
// a 4:3 photo in 9:16: a 1080x810 box scaled 2.37x to cover; the screen is a full-height middle slice
const s = 1920 / 810;
const w = visibleWindow({ transform: { scale: s, scaleX: s, scaleY: s } }, 1080, 810, 1080, 1920);
assert.ok(near(w, [0.5 - 0.5 / s, 0, 0.5 + 0.5 / s, 1]), String(w));
assert.ok(Math.abs(depthDetail({ transform: { scale: s } }, 1080, 810) - s) < 1e-9, 'drawn at the scaled-up size');
// moved left by 6.6% of the box: the slice moves right in the picture
const moved = visibleWindow({ transform: { scale: s, x: -6.58 } }, 1080, 810, 1080, 1920);
assert.ok(moved[0] > w[0] && Math.abs((moved[2] - moved[0]) - (w[2] - w[0])) < 1e-6);
// moved down: y runs upwards in texture space, so the window moves towards the top of the picture
const down = visibleWindow({ transform: { scale: 1.5, y: 10 } }, 1080, 1920, 1080, 1920);
assert.ok(near(down, [1 / 6, 1 - (0.5 + 768 / 2880), 5 / 6, 1 - (0.5 - 1152 / 2880)]), String(down));
// capped: never more than 3x, never more than 4096 px a side
assert.equal(depthDetail({ transform: { scale: 5 } }, 1080, 810), 3);
assert.ok(Math.abs(depthDetail({ transform: { scale: 3 } }, 2000, 1500) - 4096 / 2000) < 1e-9);
console.log('depthView.verify: ok');
