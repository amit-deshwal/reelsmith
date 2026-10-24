// "Behind the speaker" placement: the words go just above the brow of the main (biggest) person's head in the clip
// under the captions, through the clip's own framing, kept inside the safe heights; nobody found leaves it to the style.
import assert from 'node:assert/strict';
import type { CaptionsData } from '../captions/types';
import type { TimelineItem } from '../editor/types';
import { behindCaptionLayout, canvasOfRatio, sampleFrames } from './captionBehindPlace';
import type { FoundPerson } from './director/aimMarkers';

const fps = 30;
const canvas = { width: 1080, height: 1920 };
const selfie = { id: 's', track: 'V1', kind: 'video', name: 's', src: '/media/uploads/s.mp4', startFrame: 0, durationInFrames: 150, srcInFrame: 60, width: 1080, height: 1920 } as TimelineItem;
const captions = { enabled: true, template: 'plain', pacing: 'word', offsetFrames: 0, rsBehind: true,
  words: [{ text: 'WHAT', start: 300, end: 900 }, { text: 'A', start: 900, end: 1100 }, { text: 'VIEW', start: 1100, end: 3000 }] } as CaptionsData;

assert.deepEqual(canvasOfRatio('4:5'), { width: 4, height: 5 });
assert.deepEqual(canvasOfRatio(undefined), { width: 9, height: 16 });
assert.ok(sampleFrames(captions, [selfie], fps).every((f) => f >= 9 && f < 90), 'samples fall where the words show');

// a small friend behind and the speaker: head from 48% to 58% of the picture
const shots: Array<{ sec: number; src: string }> = [];
const people = (): FoundPerson[] => [
  { x: 0.1, y: 0.3, w: 0.15, h: 0.3, score: 0.9, face: { x: 0.12, y: 0.32, w: 0.05, h: 0.04 } },
  { x: 0.4, y: 0.45, w: 0.5, h: 0.55, score: 0.9, face: { x: 0.55, y: 0.48, w: 0.2, h: 0.1 } },
];
const layout = await behindCaptionLayout([selfie], captions, canvas, fps, async (shot) => { shots.push(shot); return people(); });
assert.equal(layout?.anchor, 'middle-center');
assert.ok(Math.abs((layout!.offsetYRatio ?? 0) - (0.48 - 0.1 * 0.1 - 0.5)) < 0.002, `across the main head: ${layout!.offsetYRatio}`);
assert.ok(shots.every((s) => s.src === selfie.src && s.sec >= 2 && s.sec < 5), 'the moments come from the clip\'s source window');

// the clip zoomed in 1.5x about the centre: the word height (47% of the picture) moves away from the middle, to 45.5%
const zoomed = await behindCaptionLayout([{ ...selfie, transform: { scale: 1.5 } }], captions, canvas, fps, async () => people());
assert.ok(Math.abs((zoomed!.offsetYRatio ?? 0) - (0.47 - 0.5) * 1.5) < 0.002, `zoomed: ${zoomed!.offsetYRatio}`);
// a head near the bottom stays above Instagram's band; nobody found or no clip gives null (the style's own height)
const low = await behindCaptionLayout([selfie], captions, canvas, fps, async () => [{ x: 0.3, y: 0.85, w: 0.4, h: 0.15, score: 0.9, face: { x: 0.4, y: 0.9, w: 0.1, h: 0.08 } }]);
assert.equal(low!.offsetYRatio, 0.22);
assert.equal(await behindCaptionLayout([selfie], captions, canvas, fps, async () => []), null);
assert.equal(await behindCaptionLayout([], captions, canvas, fps, async () => people()), null);
console.log('captionBehindPlace.verify: ok');
