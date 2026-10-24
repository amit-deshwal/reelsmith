import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { activeTimeline } from '../editor/types';
import { canDetachAudio, canReverse, detachAudioActions, flipActions, forwardsActions, isFlipped, isReversed, reversedSource, reverseActions, reverseSpanOf } from './clipOps';

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

// reverse: the clip shows the reversed copy of exactly its span, keeps place, speed and look; one undo; forwards restores
{
  let r: History = { past: [], present: emptyProjectDoc(), future: [] };
  const clip = { id: 'r', track: 'V1', kind: 'video' as const, name: 'clip', src: '/media/uploads/a.mp4', sourceAssetId: 'a', sourceRevision: 'rev-a', width: 1080, height: 1920,
    durationInFrames: 45, srcInFrame: 60, playbackRate: 2, volume: 0.7, transform: { scale: 1.2 }, effects: [{ id: 'e', assetId: 'builtin:fx-glow' }] };
  r = historyReduce(r, { type: 'add', startFrame: 30, item: clip } as never);
  const cur = () => activeTimeline(r.present).items.find((i) => i.id === 'r')!;
  assert.ok(canReverse(cur()));
  assert.equal(canReverse(cur(), true), false, 'a linked clip is not reversed alone');
  assert.equal(canReverse({ ...cur(), kind: 'image' }), false);
  // 45 timeline frames at 2x speed = 90 source frames from source frame 60 (2 s at 30 fps)
  assert.deepEqual(reverseSpanOf(cur(), 30), { startSec: 2, frames: 90 });
  assert.deepEqual(reverseSpanOf({ durationInFrames: 10, playbackRate: 1.25 }, 30), { startSec: 0, frames: 13 }, 'a fractional span rounds up');

  const steps = r.past.length;
  r = historyReduce(r, { type: 'batch', label: 'Reverse', actions: reverseActions(cur(), { src: '/media/uploads/a.rev-2000-90f30.mp4', width: 1080, height: 1920, frames: 90 }) });
  assert.equal(r.past.length, steps + 1, 'one undo step');
  const rev = cur();
  assert.equal(rev.src, '/media/uploads/a.rev-2000-90f30.mp4');
  assert.equal(rev.srcInFrame ?? 0, 0, 'plays the copy from its start');
  assert.deepEqual([rev.startFrame, rev.durationInFrames, rev.playbackRate, rev.volume], [30, 45, 2, 0.7]);
  assert.deepEqual(rev.transform, { scale: 1.2 });
  assert.equal(rev.effects?.[0]?.assetId, 'builtin:fx-glow');
  assert.notEqual(rev.sourceRevision, 'rev-a', 'a new revision, so the forwards frames are not reused');
  assert.equal(rev.sourceFilename, 'a.rev-2000-90f30.mp4');
  assert.ok(isReversed(rev));

  r = historyReduce(r, { type: 'batch', label: 'Play forwards', actions: forwardsActions(rev)! });
  const fwd = cur();
  assert.equal(fwd.src, '/media/uploads/a.mp4');
  assert.equal(fwd.srcInFrame, 60);
  assert.equal(fwd.sourceRevision, 'rev-a');
  assert.deepEqual([fwd.startFrame, fwd.durationInFrames, fwd.playbackRate], [30, 45, 2]);
  assert.equal(isReversed(fwd), false);
  assert.equal(forwardsActions(fwd), null);
  r = historyReduce(r, { type: 'undo' } as never);
  r = historyReduce(r, { type: 'undo' } as never);
  assert.equal(cur().src, '/media/uploads/a.mp4', 'undo puts the forwards clip back');
  assert.equal(cur().srcInFrame, 60);

  // the request names the clip's span; a server error comes back as the message
  let sent: Record<string, unknown> = {};
  const ok = (async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response(JSON.stringify({ ok: true, src: '/media/uploads/x.mp4', width: 9, height: 16, frames: 90 })); }) as unknown as typeof fetch;
  assert.deepEqual(await reversedSource(cur(), 30, ok), { src: '/media/uploads/x.mp4', width: 9, height: 16, frames: 90 });
  assert.deepEqual(sent, { src: '/media/uploads/a.mp4', startSec: 2, frames: 90, fps: 30 });
  const bad = (async () => new Response(JSON.stringify({ error: 'reverse at most 120 s of a clip at once' }), { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(reversedSource(cur(), 30, bad), /at most 120 s/);
}
console.log('clipOps.verify: ok');
