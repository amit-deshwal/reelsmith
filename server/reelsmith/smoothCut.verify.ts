// RS-1259 follow-up: a smooth cut's frames. A box moves steadily across a clip; a cut jumps from its frame 10 to its
// frame 40. The four overlay frames show the box in between, moving on from the first frame to the second in even
// steps, at the clip's size, with no sound; a jump too long is refused.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegBin, ffprobeBin } from '../media-binaries.ts';
import { retimeHelper } from './retimeHelper.ts';
import { cutPhases, smoothCutName, smoothCutSpan } from './smoothCut.ts';

assert.deepEqual(cutPhases(4), [0.2, 0.4, 0.6, 0.8]);
assert.deepEqual(cutPhases(2), [0.3333, 0.6667]);
assert.equal(smoothCutName('/m/talk.MOV', 1.5, 2.25, 4, 30), 'talk.cut-1500-2250x4f30.mp4');

const helper = await retimeHelper();
if ('error' in helper) {
  console.log(`smoothCut.verify: skipped (${helper.error})`);
  process.exit(0);
}
const W = 360, H = 640;
const work = mkdtempSync(join(tmpdir(), 'rs-smooth-cut-'));
try {
  const src = join(work, 'box.mp4');
  // a white 60 px box moving right 4 px a frame (x = 20 + 120 t) over a dim test pattern, with a tone
  execFileSync(ffmpegBin(), ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc2=s=${W}x${H}:r=30:d=3,lutyuv=y=val*0.5:u=128:v=128`,
    '-f', 'lavfi', '-i', 'color=c=white:s=60x60:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
    '-filter_complex', "[0][1]overlay=x='20+t*120':y=290:shortest=1,format=yuv420p[v]", '-map', '[v]', '-map', '2:a',
    '-c:v', 'libx264', '-qp', '0', '-c:a', 'aac', src]);
  const boxX = (file: string) => {
    const gray = execFileSync(ffmpegBin(), ['-v', 'error', '-i', file, '-vf', 'format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
    return Array.from({ length: gray.length / (W * H) }, (_, k) => {
      const row = gray.subarray(k * W * H + 320 * W, k * W * H + 321 * W);
      return row.findIndex((v, x) => v >= 180 && (row[x + 30] ?? 0) >= 180);
    });
  };
  const source = boxX(src);
  const r = await smoothCutSpan(src, 10 / 30, 16 / 30, 4, 30, work);
  assert.ok(!('skipped' in r), JSON.stringify(r));
  assert.equal(r.name, 'box.cut-333-533x4f30.mp4');
  assert.deepEqual([r.width, r.height, r.frames, r.hasAudio], [W, H, 4, false]);
  const xs = boxX(join(work, r.name));
  assert.equal(xs.length, 4);
  const from = source[10]!, to = source[16]!;
  assert.ok(xs.every((x) => x > from && x < to), `between ${from} and ${to}: ${xs.join(' ')}`);
  const steps = [from, ...xs, to].slice(1).map((x, k) => x - [from, ...xs][k]!);
  const even = (to - from) / 5;
  assert.ok(steps.every((d) => Math.abs(d - even) <= even * 0.5), `even steps of about ${even} px: ${steps.join(' ')}`);
  const streams = execFileSync(ffprobeBin(), ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', join(work, r.name)], { encoding: 'utf8' }).trim();
  assert.equal(streams, 'video', 'no sound: the pieces under it play theirs');
  // a second ask is the same file
  const again = await smoothCutSpan(src, 10 / 30, 16 / 30, 4, 30, work);
  assert.ok(!('skipped' in again) && again.cached);
  assert.deepEqual(await smoothCutSpan(src, 0, 3.5, 4, 30, work), { skipped: 'the jump is over 3 s; a morph that long smears' });
  await assert.rejects(smoothCutSpan(src, 1, 0.5, 4, 30, work), /fromSec < toSec/);
  console.log(`smoothCut.verify: ok (box ${from} → ${xs.join(' ')} → ${to})`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
