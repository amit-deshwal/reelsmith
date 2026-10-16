import assert from 'node:assert/strict';
import { srtSidecarName, writeSrtSidecar } from './instagramSrt';
import type { CaptionsData } from '../captions/types';
import type { TimelineItem } from '../editor/types';

assert.equal(srtSidecarName('My Reel.mp4'), 'My Reel.srt');
assert.equal(srtSidecarName('a.b.c.mov'), 'a.b.c.srt');
assert.equal(srtSidecarName('noext'), 'noext.srt');

const item = {
  id: 'clip1', track: 'v1', startFrame: 0, durationInFrames: 60, name: 'talk', kind: 'video',
  transcript: [{ text: 'hello', start: 0, end: 400 }, { text: 'world', start: 450, end: 900 }],
} as unknown as TimelineItem;
const captions: CaptionsData = { enabled: true, template: 'plain', pacing: 'phrase', sourceItemId: 'clip1' };
const base = { items: [item], fps: 30, videoName: 'reel.mp4' };

const writes: Array<{ name: string; text: string }> = [];
const write = async (name: string, blob: Blob) => { writes.push({ name, text: await blob.text() }); };

assert.deepEqual(await writeSrtSidecar({ ...base, enabled: false, captions, write }), { status: 'skipped', reason: 'off' });
assert.equal((await writeSrtSidecar({ ...base, enabled: true, captions: null, write })).status, 'skipped');
assert.equal(writes.length, 0, 'nothing written when off or without captions');

const ok = await writeSrtSidecar({ ...base, enabled: true, captions, write });
assert.deepEqual(ok, { status: 'written', name: 'reel.srt' });
assert.ok(writes[0]!.text.startsWith('1\n00:00:00,000 --> ') && writes[0]!.text.includes('hello world'));

const failed = await writeSrtSidecar({ ...base, enabled: true, captions, write: async () => { throw new Error('disk full'); } });
assert.deepEqual(failed, { status: 'failed', message: 'disk full' }, 'a write failure is reported, never thrown');
console.log('instagramSrt.verify: ok');
