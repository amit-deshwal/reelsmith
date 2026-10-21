import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractReferenceCuts, peakCuts } from './clipFeatures.ts';

// RS-1217: a reference reel's cuts. Four 1.5 s shots of moving footage: the reference rule finds each cut and nothing
// inside a shot, and reads the colour of the whole reel.
const dir = mkdtempSync(join(tmpdir(), 'rs-refcuts-'));
try {
  const file = join(dir, 'ref.mp4');
  // each shot pans across a different test pattern; mid-grey overall like footage from one trek
  const shot = (src: string) => ['-f', 'lavfi', '-t', '1.5', '-i', `${src}=size=320x568:rate=30,format=gray,eq=contrast=0.6`];
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...shot('testsrc2'), ...shot('mandelbrot'), ...shot('cellauto'), ...shot('life'),
    '-filter_complex', '[0][1][2][3]concat=n=4:v=1:a=0,scale=320:568,crop=300:540:x=10*t:y=6*t', '-pix_fmt', 'yuv420p', file]);
  const { cutsFrame, color } = await extractReferenceCuts(file, 30);
  const sec = cutsFrame.map((f) => f / 30);
  assert.equal(sec.length, 3, `three cuts: ${sec.join(', ')}`);
  [1.5, 3, 4.5].forEach((t, i) => assert.ok(Math.abs(sec[i]! - t) <= 0.25, `cut ${i} at ${t} s (found ${sec[i]})`));
  assert.ok(color && Math.abs(color.r - color.b) < 0.05, 'grey footage reads as neutral');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// frames: steady handheld wobble inside a shot (small jumps), and similar-looking shots either side of each cut
const frame = (level: number, jitter: number) => Buffer.from(Array.from({ length: 4096 }, (_, i) => Math.max(0, Math.min(255, level + ((i * 7 + jitter) % 23) - 11 + (i % 64)))));
const frames = [...Array.from({ length: 6 }, (_, k) => frame(90, k)), ...Array.from({ length: 6 }, (_, k) => frame(120, k)), ...Array.from({ length: 6 }, (_, k) => frame(95, k))];
assert.deepEqual(peakCuts(frames), [6, 12], 'a cut where the picture changes, none inside a shot');
console.log('referenceCuts.verify ok');
