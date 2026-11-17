import assert from 'node:assert/strict';
import { behindTextCount, behindTextNote } from './behindCount';

const plan = {
  sections: [
    { move: 'hold', beats: 4, clips: ['#1'], text: 'GOA', textBehind: true },
    { move: 'cut', beats: 8, clips: ['#2', '#3'] },
    { move: 'flash-cuts', beats: 4, clips: ['#4'] },
    { move: 'hold', beats: 4, clips: ['#5'] },
    { move: 'hold', beats: 4, clips: ['#6'] },
  ],
  overlays: [{ text: 'x', style: 'big-title', from: 3, to: 3, behind: true }],
} as never;
const people = (ref: string) => ['#2', '#5'].includes(ref);
const c = behindTextCount(plan, people);
assert.deepEqual(c, { placed: 2, couldCarry: [1, 3] });
assert.match(behindTextNote(c)!, /^2 lines behind the person; sections 1, 3 could carry one too/);
assert.equal(behindTextNote({ placed: 0, couldCarry: [1] }), undefined);
console.log('behindCount.verify: ok');
