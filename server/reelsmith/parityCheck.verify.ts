import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkParity, parseSsim, sampleFrames, summariseParity } from './parityCheck.ts';

// pure helpers
assert.deepEqual(sampleFrames(0), []);
assert.deepEqual(sampleFrames(3), [1, 2, 2].filter((f, i, a) => a.indexOf(f) === i));
const s = sampleFrames(300);
assert.equal(s.length, 5);
assert.ok(s[0]! > 0 && s[4]! < 299, 'avoids first and last frame');
assert.equal(parseSsim('[Parsed_ssim_0] SSIM Y:0.99 (20.0) U:0.99 V:0.99 All:0.987654 (19.1)'), 0.987654);
assert.equal(parseSsim('nothing'), null);
assert.equal(summariseParity([]).status, 'WARN');
assert.equal(summariseParity([{ frame: 1, ssim: 0.97 }, { frame: 2, ssim: 0.95 }]).status, 'PASS');
assert.equal(summariseParity([{ frame: 1, ssim: 0.97 }, { frame: 2, ssim: 0.4 }]).status, 'WARN');

// real files: an export and stills of the same / a different picture
const dir = mkdtempSync(join(tmpdir(), 'rs-parity-v-'));
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
try {
  const video = join(dir, 'reel.mp4');
  ff('-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video);
  const frames = sampleFrames(120);
  const stillOf = (frame: number, filter?: string) => {
    const out = join(dir, `s${frame}.jpg`);
    ff('-ss', String(frame / 30), '-i', video, '-frames:v', '1', ...(filter ? ['-vf', filter] : []), '-q:v', '5', out);
    return { frame, base64: readFileSync(out).toString('base64') };
  };
  // same picture, rendered smaller and as a JPEG, like the still renderer does
  const same = await checkParity({ file: video, fps: 30, frames, stills: frames.map((f) => stillOf(f, 'scale=360:640')) });
  assert.equal(same.status, 'PASS', same.detail);
  // a different picture (inverted colours and mirrored) must be caught
  const other = await checkParity({ file: video, fps: 30, frames, stills: frames.map((f) => stillOf(f, 'negate,hflip,scale=360:640')) });
  assert.equal(other.status, 'WARN', other.detail);
  // frames past the end of the file cannot be compared
  const none = await checkParity({ file: video, fps: 30, frames: [9000], stills: [{ frame: 9000, base64: stillOf(10).base64 }] });
  assert.equal(none.status, 'WARN', none.detail);
  console.log('parityCheck.verify ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
