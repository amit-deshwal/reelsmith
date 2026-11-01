// RS-1241: the no-sound copy and the Instagram start time of the reel's song.
import assert from 'node:assert/strict';
import { clock, deliverNoSoundCopy, musicNote, songOnTimeline } from './exportMusic';

const fps = 30;
const video = { id: 'v1', kind: 'video', name: 'a.mp4', startFrame: 0, durationInFrames: 900 };
const director = { id: 'rs-dir-abc-1-music', kind: 'audio', name: 'Believer.mp3', startFrame: 0, durationInFrames: 900, srcInFrame: Math.round(51.2 * fps) };
const song = songOnTimeline({ fps, items: [video, director] as never });
assert.deepEqual(song, { name: 'Believer', fromSec: 51.2, atReelSec: 0 });
assert.equal(clock(51.2), '0:51');
assert.equal(clock(125), '2:05');
assert.match(musicNote(song!), /add “Believer” from Instagram's music, start it at 0:51; the cuts follow its beat/);
// a song dragged in by hand: the longest audio that covers most of the reel; a short sound effect is not a song
assert.equal(songOnTimeline({ fps, items: [video, { id: 'x', kind: 'audio', name: 'track.m4a', startFrame: 15, durationInFrames: 880 }] as never })?.atReelSec, 0.5);
assert.equal(songOnTimeline({ fps, items: [video, { id: 'whoosh', kind: 'audio', name: 'whoosh', startFrame: 30, durationInFrames: 20 }] as never }), undefined);
assert.equal(songOnTimeline({ fps, items: [video] as never }), undefined);

// delivery: asks the server for the copy, reads it back and writes it next to the export
const written: string[] = [];
const fetcher = (async (url: string, init?: RequestInit) => {
  if (url === '/api/reelsmith/no-sound-copy') {
    assert.equal(JSON.parse(String(init!.body)).src, '/media/uploads/reel.mp4');
    return new Response(JSON.stringify({ ok: true, src: '/media/uploads/reel.no-sound.mp4', name: 'reel.no-sound.mp4' }));
  }
  return new Response(new Blob(['mp4']));
}) as typeof fetch;
const r = await deliverNoSoundCopy({ state: { fps, items: [video, director] as never }, src: '/media/uploads/reel.mp4', videoName: 'Hazy Echo.mp4', fetcher, write: async (name) => { written.push(name); } });
assert.equal(r.status, 'written');
assert.deepEqual(written, ['Hazy Echo.no-sound.mp4'], 'named after the delivered video, not the render job');
assert.equal((await deliverNoSoundCopy({ state: { fps, items: [video] as never }, src: 'x', videoName: 'a.mp4', fetcher, write: async () => {} })).status, 'none');
const failed = await deliverNoSoundCopy({ state: { fps, items: [video, director] as never }, src: 'x', videoName: 'a.mp4', fetcher: (async () => new Response(JSON.stringify({ error: 'boom' }), { status: 400 })) as typeof fetch, write: async () => {} });
assert.deepEqual(failed, { status: 'failed', message: 'boom' });
console.log('exportMusic.verify: ok');

// the director's finish hint names the song and its start; a bundled library song needs no line
{
  const { songReportLine } = await import('./exportMusic');
  const line = songReportLine({ fps, items: [video, { ...director, src: '/media/uploads/believer.mp3' }] as never });
  assert.match(line, /"Believer" is a commercial track.*start the song at 0:51/);
  assert.equal(songReportLine({ fps, items: [video, { ...director, src: '/audio/track-1.mp3' }] as never }), '');
  assert.equal(songReportLine({ fps, items: [video] as never }), '');
  console.log('exportMusic report line: ok');
}
