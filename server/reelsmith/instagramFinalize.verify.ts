import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REEL_PRESETS } from '../../shared/reelsmith/instagramPreset.ts';
import { encodeForInstagram } from './instagramEncode.ts';
import { finalizeForInstagram } from './instagramFinalize.ts';

const dir = mkdtempSync(join(tmpdir(), 'rs-fin-'));
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const preset = REEL_PRESETS['instagram-reel']!;
try {
  // a render that breaks the rules (landscape, 25 fps, no faststart) is fixed in place
  const render = join(dir, 'export.mp4');
  ff('-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
    '-t', '3', '-af', 'volume=0.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', render);
  const before = statSync(render).mtimeMs;
  const fixed = await finalizeForInstagram(render, preset);
  assert.equal(fixed.first.ok, false);
  assert.equal(fixed.ok, true, JSON.stringify(fixed.second?.checks));
  assert.equal(fixed.reencoded, true);
  assert.ok(statSync(render).mtimeMs >= before && !existsSync(render.replace('.mp4', '.instagram-tmp.mp4')), 'replaced in place, no temp left');

  // an already-good file is left alone
  const again = await finalizeForInstagram(render, preset);
  assert.equal(again.ok, true);
  assert.equal(again.reencoded, false);

  // when the safe encoder also fails, the bad result is kept as .failed.mp4 and the original is untouched
  const other = join(dir, 'other.mp4');
  ff('-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', other);
  const size = statSync(other).size;
  const broken = await finalizeForInstagram(other, preset, {
    encode: async (i, o, p) => { await encodeForInstagram(i, o, p); },
    validate: async () => ({ ok: false, checks: [{ id: 'V9', status: 'FAIL', detail: 'forced' }] }),
  });
  assert.equal(broken.ok, false);
  assert.ok(broken.failedPath && existsSync(broken.failedPath), 'failed file kept');
  assert.equal(statSync(other).size, size, 'original untouched');
  console.log('instagramFinalize.verify ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
