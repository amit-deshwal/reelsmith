import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { activeTimeline } from '../editor/types';
import { canDetachAudio, detachAudioActions, flipActions, isFlipped } from './clipOps';

let h: History = { past: [], present: emptyProjectDoc(), future: [] };
const video = { id: 'v', track: 'V1', kind: 'video' as const, name: 'clip', src: '/c.mp4', sourceAssetId: 'a', durationInFrames: 90, srcInFrame: 30, playbackRate: 2, volume: 0.5 };
h = historyReduce(h, { type: 'add', startFrame: 12, item: video } as never);
const item = () => activeTimeline(h.present).items.find((i) => i.id === 'v')!;

// flip: negate one axis, keep the other, flip again restores; one undo each
assert.equal(isFlipped(item(), 'horizontal'), false);
h = historyReduce(h, { type: 'batch', label: 'Flip', actions: flipActions(item(), 'horizontal') });
assert.equal(item().transform?.scaleX, -1);
assert.equal(isFlipped(item(), 'horizontal'), true);
assert.equal(isFlipped(item(), 'vertical'), false);
h = historyReduce(h, { type: 'batch', label: 'Flip', actions: flipActions(item(), 'horizontal') });
assert.equal(item().transform?.scaleX, 1, 'flipping twice restores');
h = historyReduce(h, { type: 'batch', label: 'Flip', actions: flipActions({ ...item(), transform: { scale: 1.5 } }, 'vertical') });
assert.equal(item().transform?.scaleY, -1.5, 'uses the clip\'s own scale');

// detach: new audio clip with the same range/speed/volume on its own track, video muted, one undo
assert.ok(canDetachAudio(item()));
const before = h.past.length;
h = historyReduce(h, { type: 'batch', label: 'Detach audio', actions: detachAudioActions(item(), 'aud', 'tr-aud')! });
assert.equal(h.past.length, before + 1, 'one undo step');
const tl = activeTimeline(h.present);
const audio = tl.items.find((i) => i.id === 'aud')!;
assert.equal(audio.kind, 'audio');
assert.equal(audio.startFrame, 12);
assert.equal(audio.durationInFrames, 90);
assert.equal(audio.srcInFrame, 30);
assert.equal(audio.playbackRate, 2);
assert.equal(audio.volume, 0.5);
assert.equal(audio.sourceAssetId, 'a');
assert.notEqual(audio.track, 'V1');
assert.equal(item().volume, 0, 'video is muted');
assert.equal(canDetachAudio(item()), false, 'cannot detach twice');
h = historyReduce(h, { type: 'undo' } as never);
assert.equal(activeTimeline(h.present).items.some((i) => i.id === 'aud'), false);
assert.equal(item().volume, 0.5);
console.log('clipOps.verify: ok');
