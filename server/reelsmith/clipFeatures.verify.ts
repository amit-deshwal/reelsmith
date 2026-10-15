import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractClipFeatures } from './clipFeatures.ts';
import { groupNearDuplicates } from '../../src/reelsmith/assembler/scoring.ts';

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
  console.log('clipFeatures.verify: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
