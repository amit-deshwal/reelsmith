// RS-302 check: 10 fixture projects (varied sources, as an export might produce them) pass V1-V9 after the Instagram
// re-encode, and corrupted copies of a passing reel are caught.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REEL_PRESETS } from '../../shared/reelsmith/instagramPreset.ts';
import { encodeForInstagram } from './instagramEncode.ts';
import { validateReel } from './exportValidate.ts';

const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { maxBuffer: 1 << 26 });
const V = (size: string, rate: number, pat = 'testsrc2') => ['-f', 'lavfi', '-i', `${pat}=size=${size}:rate=${rate}`];
const A = (src: string) => ['-f', 'lavfi', '-i', src];
const h264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];

interface Fixture { id: string; preset: keyof typeof REEL_PRESETS; args: string[]; ext?: string }
const fixtures: Fixture[] = [
  { id: 'landscape-25fps-tone', preset: 'instagram-reel', args: [...V('1280x720', 25), ...A('sine=f=440:r=44100'), '-t', '4', ...h264] },
  { id: 'portrait-30fps-loud', preset: 'instagram-reel', args: [...V('1080x1920', 30), ...A('sine=f=220:r=48000'), '-af', 'volume=1.0', '-t', '4', ...h264] },
  { id: 'square-24fps', preset: 'instagram-reel', args: [...V('1080x1080', 24), ...A('sine=f=880:r=48000'), '-t', '4', ...h264] },
  { id: 'small-15fps', preset: 'instagram-reel', args: [...V('320x568', 15), ...A('sine=f=330:r=22050'), '-t', '3', ...h264] },
  { id: 'fullrange-silent-track', preset: 'instagram-reel', args: [...V('720x1280', 30), ...A('anullsrc=r=48000:cl=stereo'), '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuvj420p', '-c:a', 'aac'] },
  { id: 'mono-quiet', preset: 'instagram-reel', args: [...V('1080x1920', 30), ...A('sine=f=500:r=48000'), '-ac', '1', '-af', 'volume=0.05', '-t', '4', ...h264] },
  { id: 'noise-audio', preset: 'instagram-reel', args: [...V('1080x1920', 30), ...A('anoisesrc=r=48000:a=0.5'), '-t', '4', ...h264] },
  { id: 'sixty-fps', preset: 'instagram-reel-60', args: [...V('1080x1920', 60), ...A('sine=f=440:r=48000'), '-t', '3', ...h264] },
  { id: 'no-music', preset: 'instagram-reel-silent', args: [...V('1080x1920', 30), ...A('sine=f=440:r=48000'), '-t', '3', ...h264] },
  { id: 'vfr-source', preset: 'instagram-reel', args: [...V('1080x1920', 60), ...A('sine=f=440:r=48000'), '-t', '4', '-vf', "select='lt(mod(n,7),3)'", '-fps_mode', 'vfr', ...h264] },
];

const dir = mkdtempSync(join(tmpdir(), 'rs-fix-'));
try {
  assert.equal(fixtures.length >= 10, true);
  let reel = '';
  for (const f of fixtures) {
    const src = join(dir, `${f.id}-src.mp4`);
    const out = join(dir, `${f.id}.mp4`);
    ff(...f.args, src);
    const preset = REEL_PRESETS[f.preset]!;
    await encodeForInstagram(src, out, preset);
    const r = await validateReel(out, { preset, intendedBlack: [] });
    assert.deepEqual(r.checks.filter((c) => c.status === 'FAIL'), [], `${f.id}: ${JSON.stringify(r.checks)}`);
    assert.equal(r.ok, true, f.id);
    if (f.id === 'portrait-30fps-loud') reel = out;
  }

  // corrupted fixtures must all be caught
  const preset = REEL_PRESETS['instagram-reel']!;
  const bytes = readFileSync(reel);
  const mutate = (name: string, buf: Buffer) => { const p = join(dir, name); writeFileSync(p, buf); return p; };
  const corrupt: Record<string, string> = {
    truncated: mutate('trunc.mp4', bytes.subarray(0, Math.floor(bytes.length / 3))),
    garbage: mutate('garbage.mp4', Buffer.from('not a video at all')),
    flippedMiddle: (() => {
      const b = Buffer.from(bytes);
      const mid = Math.floor(b.length * 0.6);
      for (let i = 0; i < 4000; i++) b[mid + i] = b[mid + i]! ^ 0xff;
      return mutate('flip.mp4', b);
    })(),
    headerSmashed: (() => {
      const b = Buffer.from(bytes);
      b.fill(0, 4, 12); // the first box's type
      return mutate('hdr.mp4', b);
    })(),
  };
  for (const [name, p] of Object.entries(corrupt)) {
    let ok = true;
    try { ok = (await validateReel(p, { preset })).ok; } catch { ok = false; }
    assert.equal(ok, false, `corrupted fixture "${name}" was not caught`);
  }
  console.log('exportFixtures.verify: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
