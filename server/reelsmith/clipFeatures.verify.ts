import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureTimeFromMetadata, extractClipFeatures } from './clipFeatures.ts';
import { sourcePlacement } from '../../src/reelsmith/assembler/sourcePlacement';
import { pickClips } from '../../src/reelsmith/assembler/beatMontage';
import { toAssemblyClips, groupNearDuplicates } from '../../src/reelsmith/assembler/scoring.ts';

const dir = mkdtempSync(join(tmpdir(), 'rs-feat-'));
const gen = (name: string, src: string) => {
  const out = join(dir, name);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-t', '4', '-pix_fmt', 'yuv420p', out]);
  return out;
};
try {
  const sharp = gen('sharp.mp4', 'testsrc2=size=320x240:rate=30');
  const flat = gen('flat.mp4', 'color=c=gray:size=320x240:rate=30');
  const dark = gen('dark.mp4', 'color=c=black:size=320x240:rate=30');
  const sharp2 = gen('sharp-again.mp4', 'testsrc2=size=320x240:rate=30');

  const [a, f, d, a2] = await Promise.all([
    extractClipFeatures(sharp, 'sharp', 30), extractClipFeatures(flat, 'flat', 30),
    extractClipFeatures(dark, 'dark', 30), extractClipFeatures(sharp2, 'sharp2', 30),
  ]);
  assert.ok(a.windows.length >= 1);
  assert.ok(a.windows[0]!.sharpness > f.windows[0]!.sharpness, 'detail scores sharper than a flat frame');
  assert.ok(f.windows[0]!.exposure > d.windows[0]!.exposure, 'mid-grey beats black for exposure');
  assert.ok(a.windows[0]!.motion > f.windows[0]!.motion, 'moving test pattern has motion, flat does not');
  assert.equal(a.dHash.length, 16);
  const g = groupNearDuplicates([a, a2, f]);
  assert.equal(g.get('sharp'), g.get('sharp2'), 'identical pictures group together');
  assert.equal(g.has('flat'), false);

  // shot boundaries: a hard cut at 2 s splits the windows there
  const cut = join(dir, 'cut.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30:d=2', '-f', 'lavfi', '-i', 'color=c=red:size=320x240:rate=30:d=2',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', cut]);
  const c = await extractClipFeatures(cut, 'cut', 30);
  assert.equal(c.shotBoundariesFrame?.length, 1, JSON.stringify(c.shotBoundariesFrame));
  const at = c.shotBoundariesFrame![0]!;
  assert.ok(Math.abs(at - 60) <= 8, `cut found at ${at}`);
  assert.ok(c.windows.every((w) => !(w.startFrame < at && w.endFrame > at)), 'no window spans the cut');
  assert.equal(a.shotBoundariesFrame?.length, 0, 'a continuous clip has no cuts');
  const scored = toAssemblyClips([a, a2, c].map((feature) => ({ assetId: feature.assetId, name: feature.assetId, src: '/fixture', kind: 'video' as const, durationInFrames: 120 })), [a, a2, c], 15);
  const picks = pickClips(scored, 3, false, 7);
  assert.ok(!(picks.some((pick) => pick.assetId === 'sharp') && picks.some((pick) => pick.assetId === 'sharp2')), 'fixture picker excludes duplicate footage');
  const cutClip = scored.find((clip) => clip.assetId === 'cut')!;
  for (const length of [15, 30, 60, 90]) {
    const placement = sourcePlacement(cutClip, length);
    const sourceEnd = placement.srcInFrame + length * placement.playbackRate;
    assert.ok(!(placement.srcInFrame < at && sourceEnd > at), 'rendered source range stays inside the extracted shot boundary');
  }

  // subject: a detailed centre on a flat background beats a uniform texture
  const centred = join(dir, 'centred.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:size=320x240:rate=30:d=2', '-f', 'lavfi', '-i', 'testsrc2=size=120x100:rate=30:d=2',
    '-filter_complex', '[0:v][1:v]overlay=100:70', '-pix_fmt', 'yuv420p', centred]);
  const s = await extractClipFeatures(centred, 'centred', 30);
  assert.ok(s.windows[0]!.subject > 0.3, `centred subject ${s.windows[0]!.subject}`);
  assert.ok(f.windows[0]!.subject === 0, 'flat frame has no subject');

  // speech: syllable-like bursts in the voice band count as speech; a steady tone and silence do not
  const withAudio = (name: string, audio: string) => {
    const out = join(dir, name);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:size=160x120:rate=30:d=4', '-f', 'lavfi', '-i', audio,
      '-t', '4', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
    return out;
  };
  const talk = withAudio('talk.mp4', "anoisesrc=color=pink:amplitude=0.4:d=4,volume='if(lt(mod(t,0.31),0.17),1,0.003)':eval=frame");
  const tone = withAudio('tone.mp4', 'sine=frequency=1000:duration=4');
  const [ft, fo] = await Promise.all([extractClipFeatures(talk, 'talk', 30), extractClipFeatures(tone, 'tone', 30)]);
  assert.ok(ft.windows.some((w) => w.speech), 'bursty voice-band audio reads as speech');
  assert.ok(fo.windows.every((w) => !w.speech), 'a steady tone is not speech');
  assert.ok(f.windows.every((w) => !w.speech), 'no audio, no speech');

  // Embedded dates, rather than the upload/copy time, drive chronological recipes.
  const captured = join(dir, 'captured.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', sharp, '-c', 'copy', '-metadata', 'creation_time=2024-06-01T12:00:00Z', captured]);
  const dated = await extractClipFeatures(captured, 'dated', 30);
  assert.equal(dated.captureTimeMs, Date.parse('2024-06-01T12:00:00Z'));
  assert.equal(captureTimeFromMetadata({ format: { tags: { creation_time: '2024-06-01T12:00:00Z', 'com.apple.quicktime.creationdate': '2024-05-01T17:30:00+0530' } } }), Date.parse('2024-05-01T12:00:00Z'));
  assert.equal(captureTimeFromMetadata({ streams: [{ tags: { creation_time: '2024-06-01T12:00:00' } }] }), Date.parse('2024-06-01T12:00:00Z'));
  assert.equal(captureTimeFromMetadata({ format: { tags: { creation_time: 'invalid' } } }), undefined);

  // Photos also receive quality and dHash analysis; they are not all neutral-score picks.
  const photo = join(dir, 'photo.png');
  const blank = join(dir, 'blank.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', sharp, '-frames:v', '1', photo]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', flat, '-frames:v', '1', blank]);
  const [p, p2, pb] = await Promise.all([
    extractClipFeatures(photo, 'photo', 30, { stillImage: true }),
    extractClipFeatures(photo, 'photo-copy', 30, { stillImage: true }),
    extractClipFeatures(blank, 'blank-photo', 30, { stillImage: true }),
  ]);
  assert.ok(p.windows[0]!.sharpness > pb.windows[0]!.sharpness);
  const photoGroups = groupNearDuplicates([p, p2, pb]);
  assert.equal(photoGroups.get('photo'), photoGroups.get('photo-copy'));
  assert.equal(photoGroups.has('blank-photo'), false);

  console.log('clipFeatures.verify: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
