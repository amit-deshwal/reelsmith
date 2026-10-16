// A group selfie (big face low in the frame, friends standing behind) keeps everyone's head when cropped 9:16 -> 4:5.
import assert from 'node:assert/strict';
import { cropPositionForFocus, focusRetention } from './cropFocus';
import { groupFocusRect } from './groupFocus';

const GW = 18; const GH = 32;
const people = new Uint8Array(GW * GH);
// everyone: x 0.03-1.0, y 0.30-1.0 (heads at the top of that region, the selfie face lower)
for (let y = Math.floor(0.3 * GH); y < GH; y += 1) for (let x = 1; x < GW; x += 1) people[y * GW + x] = 1;
// the detector's box for the selfie face (hat and face), low in the frame
const selfieFace = { x: 0.2, y: 0.54, w: 0.36, h: 0.3 };
const frame = { w: 2754, h: 4896, target: 0.8 }; // 9:16 photo into a 4:5 reel

const cropTop = (focus: { x: number; y: number; w: number; h: number }) => {
  const windowH = (frame.w / frame.h) / frame.target; // fraction of the height that stays
  return cropPositionForFocus(frame.w, frame.h, frame.target, focus).y * (1 - windowH);
};
const headsY = 0.3; // the friends' heads begin here
assert.ok(cropTop(selfieFace) >= headsY - 0.01, `face-only focus: the crop starts at the friends' heads, no headroom (the bug): ${cropTop(selfieFace).toFixed(2)}`);

const group = groupFocusRect(selfieFace, people, GW, GH)!;
assert.ok(group.y <= headsY && group.y + group.h >= selfieFace.y + selfieFace.h, 'the focus covers the heads and the selfie face');
assert.ok(cropTop(group) <= headsY - 0.08, `group focus: heads have headroom (crop starts at ${cropTop(group).toFixed(2)})`);
assert.ok(focusRetention(frame.w, frame.h, frame.target, group) > 0.95, 'the whole focus fits in the crop');

// nothing to add: no mask -> the face; a tiny mask is ignored; no face and no mask -> nothing
assert.deepEqual(groupFocusRect(selfieFace, new Uint8Array(GW * GH), GW, GH), selfieFace);
const speck = new Uint8Array(GW * GH); speck[100] = 1;
assert.deepEqual(groupFocusRect(selfieFace, speck, GW, GH), selfieFace);
assert.equal(groupFocusRect(null, new Uint8Array(GW * GH), GW, GH), null);
// a mask but no face still gives the people region's upper part
const noFace = groupFocusRect(null, people, GW, GH)!;
assert.ok(noFace.y <= headsY && noFace.h > 0.3 && noFace.h < 0.6);
console.log('groupFocus.verify: ok');
