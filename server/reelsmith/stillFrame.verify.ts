// The freeze-frame still: the exact moment of the clip, saved once next to it, at the clip's own size.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegBin } from '../media-binaries.ts';
import { extractStill, stillName } from './stillFrame.ts';

const dir = mkdtempSync(join(tmpdir(), 'rs-still-'));
try {
  // 1 s red, then 1 s blue, portrait
  const clip = join(dir, 'clip.mp4');
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=180x320:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=blue:s=180x320:r=30:d=1',
    '-filter_complex', '[0][1]concat=n=2:v=1:a=0', '-pix_fmt', 'yuv420p', clip]);
  const rgb = (name: string) => [...execFileSync(ffmpegBin(), ['-v', 'error', '-i', join(dir, name), '-vf', 'scale=1:1,format=rgb24', '-f', 'rawvideo', '-'])];
  const red = await extractStill(clip, 0.5);
  assert.equal(red.name, 'clip.still-500.jpg');
  assert.deepEqual([red.width, red.height], [180, 320]);
  const [r, , b] = rgb(red.name);
  assert.ok(r! > 200 && b! < 60, `0.5 s is red (${rgb(red.name)})`);
  const blue = await extractStill(clip, 1.5);
  const [r2, , b2] = rgb(blue.name);
  assert.ok(b2! > 200 && r2! < 60, `1.5 s is blue (${rgb(blue.name)})`);
  // the same moment is read once
  const before = statSync(join(dir, red.name)).mtimeMs;
  await extractStill(clip, 0.5);
  assert.equal(statSync(join(dir, red.name)).mtimeMs, before);
  assert.equal(stillName('/x/IMG_1.MOV', 3.21), 'IMG_1.still-3210.jpg');
  console.log('stillFrame.verify: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
