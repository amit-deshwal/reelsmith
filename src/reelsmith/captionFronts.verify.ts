// Captions behind the speaker: while such a caption shows, the clips under it get a cut-out copy (painted above the
// captions), the person cut-out last after the clip's own effects; other clips and other caption styles get none.
import assert from 'node:assert/strict';
import type { CaptionsData } from '../captions/types';
import type { TimelineItem } from '../editor/types';
import { captionFrontItems } from './captionFronts';
import { FRONT_CUTOUT } from './director/frontCutout';

const fps = 30;
const clip = (id: string, startFrame: number, durationInFrames: number, extra: Partial<TimelineItem> = {}): TimelineItem =>
  ({ id, track: 'V1', kind: 'video', name: id, src: `/media/uploads/${id}.mp4`, startFrame, durationInFrames, volume: 1, ...extra }) as TimelineItem;
const items = [
  clip('a', 0, 90), clip('b', 90, 90, { effects: [{ id: 'g', assetId: 'builtin:fx-glow' }], transform: { scale: 1.2 } }),
  clip('photo', 300, 30, { kind: 'image' }), clip('bg', 0, 400, { kind: 'solid', track: 'V0' }),
];
// two words from 3.5 to 4.5 s: frames 105-135, inside clip b only
const captions: CaptionsData = { enabled: true, template: 'plain', pacing: 'word', words: [{ text: 'NO', start: 3500, end: 3900 }, { text: 'WAY', start: 3900, end: 4500 }], offsetFrames: 0, rsBehind: true };

const fronts = captionFrontItems(items, [captions], items, fps);
assert.deepEqual(fronts.map((f) => f.id), ['b::caption-front']);
const b = fronts[0]!;
assert.deepEqual([b.startFrame, b.durationInFrames, b.src, b.volume], [90, 90, '/media/uploads/b.mp4', 0], 'same moment, silent');
assert.deepEqual(b.transform, { scale: 1.2 }, 'same framing');
assert.deepEqual(b.effects?.map((e) => e.assetId), ['builtin:fx-glow', FRONT_CUTOUT], 'same look, cut out last');
assert.equal(items[1]!.effects?.length, 1, 'the clip itself is unchanged');

// a caption over the photo too; off, other styles, no captions, and an existing cut-out give nothing extra
const later: CaptionsData = { ...captions, words: [...captions.words!, { text: 'REALLY', start: 10100, end: 10600 }] };
assert.deepEqual(captionFrontItems(items, [later], items, fps).map((f) => f.id), ['b::caption-front', 'photo::caption-front']);
assert.deepEqual(captionFrontItems(items, [{ ...captions, rsBehind: false }], items, fps), []);
assert.deepEqual(captionFrontItems(items, [{ ...captions, enabled: false }], items, fps), []);
assert.deepEqual(captionFrontItems(items, [null], items, fps), []);
const already = [clip('cut', 90, 90, { effects: [{ id: 'c', assetId: FRONT_CUTOUT }] })];
assert.deepEqual(captionFrontItems(already, [captions], already, fps), []);
console.log('captionFronts.verify: ok');
