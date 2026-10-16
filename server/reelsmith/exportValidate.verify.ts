import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REEL_PRESETS } from '../../shared/reelsmith/instagramPreset.ts';
import { encodeForInstagram } from './instagramEncode.ts';
import { validateReel } from './exportValidate.ts';

const dir = mkdtempSync(join(tmpdir(), 'rs-val-'));
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
try {
  // a landscape, 25 fps source with loud audio and no faststart
  const src = join(dir, 'src.mp4');
  ff('-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
    '-t', '4', '-af', 'volume=0.9', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', src);
  const bad = await validateReel(src, { preset: REEL_PRESETS['instagram-reel']!, quick: true });
  assert.equal(bad.ok, false, 'the raw source must fail');
  assert.ok(bad.checks.find((c) => c.id === 'V1')!.status === 'FAIL', 'not faststart');
  assert.ok(bad.checks.find((c) => c.id === 'V2')!.status === 'FAIL', 'wrong size / fps');

  const out = join(dir, 'reel.mp4');
  await encodeForInstagram(src, out, REEL_PRESETS['instagram-reel']!);
  const good = await validateReel(out, { preset: REEL_PRESETS['instagram-reel']!, intendedBlack: [] });
  const fails = good.checks.filter((c) => c.status === 'FAIL');
  assert.deepEqual(fails, [], JSON.stringify(good.checks));
  assert.equal(good.ok, true);

  // wrong preset => fails on fps
  const wrong = await validateReel(out, { preset: REEL_PRESETS['instagram-reel-60']!, quick: true });
  assert.equal(wrong.ok, false);

  // silent preset
  const silent = join(dir, 'silent.mp4');
  await encodeForInstagram(src, silent, REEL_PRESETS['instagram-reel-silent']!);
  const s = await validateReel(silent, { preset: REEL_PRESETS['instagram-reel-silent']!, quick: true });
  assert.equal(s.ok, true, JSON.stringify(s.checks));
  assert.equal(s.checks.find((c) => c.id === 'V3')!.detail, 'no audio, as requested');

  // a silent audio track (e.g. a collage with no song) and a full-range source still pass the loudness/range checks
  const quiet = join(dir, 'quiet.mp4');
  ff('-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuvj420p', '-c:a', 'aac', quiet);
  const quietOut = join(dir, 'quiet-reel.mp4');
  await encodeForInstagram(quiet, quietOut, REEL_PRESETS['instagram-reel']!);
  const q = await validateReel(quietOut, { preset: REEL_PRESETS['instagram-reel']!, intendedBlack: [] });
  assert.deepEqual(q.checks.filter((c) => c.status === 'FAIL'), [], JSON.stringify(q.checks));

  // truncated file => V5 or V1 failure, never a crash
  const cut = join(dir, 'cut.mp4');
  execFileSync('sh', ['-c', `head -c 20000 "${out}" > "${cut}"`]);
  const t = await validateReel(cut, { preset: REEL_PRESETS['instagram-reel']!, quick: true });
  assert.equal(t.ok, false);

  // black screen => V7 warns
  const blk = join(dir, 'black.mp4');
  ff('-f', 'lavfi', '-i', 'color=c=black:size=1080x1920:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', blk);
  const b = await validateReel(blk, { preset: REEL_PRESETS['instagram-reel']! });
  assert.equal(b.checks.find((c) => c.id === 'V7')!.status, 'WARN');
  console.log('exportValidate.verify: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
