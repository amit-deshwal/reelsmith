// Reverse clip: the span's frames come back last to first across the one-second joins, with its sound backwards too,
// at the clip's size and frame count, made once per span.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegBin, ffprobeBin } from '../media-binaries.ts';
import { reverseChunks, reverseName, reverseSpan } from './reverseClip.ts';
import { extractStill } from './stillFrame.ts';

assert.deepEqual(reverseChunks(70, 30), [[0, 30], [30, 30], [60, 10]]);
assert.deepEqual(reverseChunks(30, 30), [[0, 30]]);
assert.equal(reverseName('/x/IMG_1.MOV', 1.5, 45, 30), 'IMG_1.rev-1500-45f30.mp4');

const dir = mkdtempSync(join(tmpdir(), 'rs-reverse-'));
try {
  // 3 s portrait at 30 fps: frame n has brightness 20 + 2n; the tone grows louder over time
  const clip = join(dir, 'clip.mp4');
  execFileSync(ffmpegBin(), ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=64x96:r=30:d=3,format=gray,geq=lum=20+2*N',
    '-f', 'lavfi', '-i', 'aevalsrc=0.3*t*sin(2*PI*440*t):s=48000:d=3',
    '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', clip]);
  const lumas = (file: string) => [...execFileSync(ffmpegBin(), ['-v', 'error', '-i', file, '-vf', 'scale=1:1,format=gray', '-f', 'rawvideo', '-'])];
  const loudness = (file: string) => {
    const pcm = execFileSync(ffmpegBin(), ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-f', 's16le', '-']);
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
    const rms = (from: number, to: number) => Math.sqrt(samples.subarray(from, to).reduce((s, v) => s + v * v, 0) / Math.max(1, to - from));
    return [rms(0, samples.length / 2), rms(samples.length / 2, samples.length)];
  };

  // frames 15..54 (crosses the join at 30 frames)
  const r = await reverseSpan(clip, 0.5, 40, 30);
  assert.equal(r.name, 'clip.rev-500-40f30.mp4');
  assert.deepEqual([r.width, r.height, r.hasAudio, r.cached], [64, 96, true, false]);
  const out = join(dir, r.name);
  const got = lumas(out);
  assert.equal(got.length, 40, 'one frame out per frame in');
  got.forEach((luma, i) => {
    const expected = 20 + 2 * (54 - i);
    assert.ok(Math.abs(luma - expected) <= 3, `frame ${i} is source frame ${54 - i} (luma ${luma}, expected ${expected})`);
  });
  const [first, second] = loudness(out);
  assert.ok(first! > second! * 1.2, `the sound is backwards: loud first (${first!.toFixed(0)} vs ${second!.toFixed(0)})`);
  const duration = Number(execFileSync(ffprobeBin(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString());
  assert.ok(Math.abs(duration - 40 / 30) < 0.05, `duration ${duration}`);

  // the same span is made once
  const before = statSync(out).mtimeMs;
  assert.equal((await reverseSpan(clip, 0.5, 40, 30)).cached, true);
  assert.equal(statSync(out).mtimeMs, before);

  // a silent clip stays silent
  const mute = join(dir, 'mute.mp4');
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-i', clip, '-an', '-c:v', 'copy', mute]);
  const m = await reverseSpan(mute, 0, 10, 30);
  assert.equal(m.hasAudio, false);
  assert.equal(lumas(join(dir, m.name)).length, 10);

  await assert.rejects(reverseSpan(clip, 0, 30 * 121, 30), /at most 120 s/);

  // A local import is stored by reference: the source is outside uploads, and what is made from it (a reversed copy, a
  // still, a depth map) must land in the uploads folder under its upload name, where its /media/uploads URL points.
  // Written beside the source, the render failed with "missing_source" (depth maps, runs of 2026-11-07).
  const uploads = join(dir, 'uploads');
  mkdirSync(uploads);
  const ref = await reverseSpan(clip, 0, 10, 30, uploads, 'imported.mov');
  assert.equal(ref.name, 'imported.rev-0-10f30.mp4');
  assert.ok(existsSync(join(uploads, ref.name)), 'the reversed copy is in uploads under the imported name');
  assert.ok(!existsSync(join(dir, 'clip.rev-0-10f30.mp4')), 'nothing new beside the source');
  const still = await extractStill(clip, 1, uploads, 'imported.mov');
  assert.ok(existsSync(join(uploads, still.name)) && still.name.startsWith('imported.'), `the still is in uploads (${still.name})`);
  console.log('reverseClip.verify: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
