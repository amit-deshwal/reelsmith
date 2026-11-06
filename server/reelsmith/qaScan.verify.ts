// RS-1266: the QA scan of an export: its SHA-256 and a click measure at each audio seam, on real AAC files.
// A 317.3 Hz tone that jumps half a cycle at 2.0 s (what a hard cut between two pieces does) clicks; the same jump with
// the 10 ms edge fade of RS-1265, an unbroken tone, and a jump in silence do not.
//   node --import tsx server/reelsmith/qaScan.verify.ts
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegBin } from '../media-binaries.ts';
import { CLICK_RATIO, qaScan } from './qaScan.ts';

const work = mkdtempSync(join(tmpdir(), 'rs-qascan-'));
const make = (name: string, expr: string) => {
  const out = join(work, `${name}.mp4`);
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x568:r=30:d=4', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=48000:d=4`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '320k', '-shortest', out]);
  return out;
};
const tone = (phase: string, gain = '1') => `0.5*${gain}*sin(2*PI*317.3*t+${phase})`;
try {
  const jump = make('jump', tone('if(gte(t,2),PI,0)'));
  const faded = make('faded', tone('if(gte(t,2),PI,0)', 'min(1,abs(t-2)/0.01)'));
  const steady = make('steady', tone('0'));
  const hush = make('hush', tone('if(gte(t,2),PI,0)', 'if(between(t,1.7,2.3),0,1)'));

  const a = await qaScan(jump, [1, 2, 3]);
  assert.equal(a.sha256, createHash('sha256').update(readFileSync(jump)).digest('hex'));
  assert.deepEqual(a.seams.map((s) => s.click), [false, true, false], JSON.stringify(a.seams));
  assert.ok(a.seams[1]!.ratio > 20, `the jump is far sharper than the tone (${a.seams[1]!.ratio}x)`);
  for (const [name, file] of [['faded', faded], ['steady', steady], ['hush', hush]] as const) {
    const r = await qaScan(file, [2]);
    assert.equal(r.seams[0]!.click, false, `${name}: ${JSON.stringify(r.seams)}`);
    console.log(`${name}: ${r.seams[0]!.ratio}x (click above ${CLICK_RATIO}x)`);
  }
  console.log(`jump: ${a.seams[1]!.ratio}x`);
  // no seams: only the hash, no decode
  const none = await qaScan(steady, []);
  assert.equal(none.seams.length, 0);
  assert.equal(none.sha256.length, 64);
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log('qaScan: ok');
