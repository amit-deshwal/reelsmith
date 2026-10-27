import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { frameRepeatCheck, repeatedFrames } from './exportValidate.ts';

// RS-1231: a stalled render's freezes and stutters are named by reel second; a lower frame-rate clip is not a stutter
const moving = (n: number) => Array.from({ length: n }, () => 3);
const at = (d: number[], frames: number[]) => { frames.forEach((i) => { d[i] = 0; }); return d; };
assert.deepEqual(repeatedFrames(moving(90), [], 30), { freezes: [], stutters: [], cadence: false });
const stall = repeatedFrames(at(moving(90), [40, 43, 44, 49, 52]), [], 30);
assert.deepEqual(stall.stutters.map(([s, e]) => [s.toFixed(2), e.toFixed(2)]), [['1.33', '1.73']]);
const pulldown = repeatedFrames(at(moving(90), [4, 9, 14, 19, 24, 29, 34]), [], 30);
assert.deepEqual(pulldown.stutters, []);
assert.equal(pulldown.cadence, true);
assert.deepEqual(repeatedFrames(at(moving(90), [10, 60]), [], 30).stutters, [], 'two lone repeats are not a stutter');
assert.deepEqual(repeatedFrames(moving(90), [[1, 2]], 30).freezes, [[1, 2]]);
assert.deepEqual(repeatedFrames(moving(90), [[1, 2]], 30, [[0.9, 2.05]]).freezes, [], 'a freeze frame someone placed is fine');

// on real encodes: motion, a 1 s freeze, uneven repeats, then a slow push on a photo
const dir = mkdtempSync(join(tmpdir(), 'rs-frz-'));
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
try {
  const p = (n: string) => join(dir, n);
  ff('-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=30', '-t', '2', p('a.mp4'));
  ff('-i', p('a.mp4'), '-vf', 'trim=start_frame=29:end_frame=30,loop=29:1:0,setpts=N/30/TB', '-r', '30', p('frz.mp4'));
  ff('-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=1', '-frames:v', '1', p('still.png'));
  ff('-loop', '1', '-i', p('still.png'), '-vf', "zoompan=z='1+0.0008*on':d=90:s=540x960:fps=30", '-frames:v', '90', p('kb.mp4'));
  ff('-i', p('a.mp4'), '-i', p('frz.mp4'), '-i', p('kb.mp4'), '-filter_complex', '[0][1][2]concat=n=3:v=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', p('frozen.mp4'));
  const v10 = (f: string, holds: Array<[number, number]> = []) => frameRepeatCheck(f, 30, 5, holds);
  const frozen = await v10(p('frozen.mp4'));
  assert.equal(frozen.status, 'WARN');
  assert.match(frozen.detail, /frozen at 2\.0-3\.0s/);
  assert.doesNotMatch(frozen.detail, /stutter/, 'the slow push is not flagged');
  assert.equal((await v10(p('frozen.mp4'), [[2, 3]])).status, 'PASS');

  // 24 fps footage in a 30 fps reel repeats one frame in five, evenly
  ff('-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=24', '-t', '3', '-vf', 'fps=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', p('pulldown.mp4'));
  const pd = await v10(p('pulldown.mp4'));
  assert.equal(pd.status, 'PASS', pd.detail);
  const clean = await v10(p('a.mp4'));
  assert.equal(clean.status, 'PASS', clean.detail);
  console.log('repeatedFrames.verify ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
