import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REEL_PRESETS, presetForCanvas } from '../../shared/reelsmith/instagramPreset.ts';
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

  // RS-904: a 4:5 and a 16:9 project are finalised at their own size, not padded into 9:16
  for (const [w, h, name] of [[1080, 1350, '4:5'], [1920, 1080, '16:9']] as const) {
    const sized = presetForCanvas(preset, w, h)!;
    const shaped = join(dir, `shape-${w}x${h}.mp4`);
    ff('-f', 'lavfi', '-i', `testsrc2=size=${w}x${h}:rate=25`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
      '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', shaped);
    const r = await finalizeForInstagram(shaped, sized);
    assert.equal(r.ok, true, `${name}: ${JSON.stringify((r.second ?? r.first).checks)}`);
    const size = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', shaped]).toString().trim();
    assert.equal(size, `${w},${h}`, `${name} keeps its own size`);
  }
  assert.equal(presetForCanvas(preset, 1000, 1000), null, 'unsupported shapes get no preset');
  assert.equal(presetForCanvas(preset, 1080, 1920), preset);
  assert.match(presetForCanvas(preset, 1080, 1350)!.label, /4:5.*1080×1350/);

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

  // RS-603: a quiet mix with loud short peaks (like speech) used to stay ~5 dB under -14 LUFS, because loudnorm's linear mode
  // will not push peaks past the ceiling. Gain + limiter now reaches the target with the peaks under -1 dBTP.
  const peaky = join(dir, 'peaky.mp4');
  ff('-f', 'lavfi', '-i', 'color=c=gray:s=1080x1920:r=30:d=4', '-f', 'lavfi', '-i',
    'aevalsrc=0.9*sin(2*PI*1000*t)*lt(mod(t\\,0.5)\\,0.01)+0.03*sin(2*PI*300*t):s=48000:d=4',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-t', '4', peaky);
  const loud = await finalizeForInstagram(peaky, preset);
  const v6 = loud.second?.checks.find((c) => c.id === 'V6') ?? loud.first.checks.find((c) => c.id === 'V6');
  assert.equal(loud.ok, true, JSON.stringify(loud.second?.checks ?? loud.first.checks));
  assert.equal(v6?.status, 'PASS', v6?.detail);

  // only the sound fails (too quiet): the picture is kept bit for bit and just the audio is rewritten
  const quiet = join(dir, 'quiet.mp4');
  ff('-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-af', 'volume=0.02', '-c:v', 'libx264', '-profile:v', 'high', '-b:v', '12M', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709',
    '-color_trc', 'bt709', '-color_range', 'tv', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', '4', '-movflags', '+faststart', quiet);
  const videoHash = (f: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-map', '0:v', '-c', 'copy', '-f', 'md5', '-']).toString();
  const pictureBefore = videoHash(quiet);
  const calls: boolean[] = [];
  const fast = await finalizeForInstagram(quiet, preset, { encode: async (i, o, p, opts) => { calls.push(!!opts?.copyVideo); await encodeForInstagram(i, o, p, opts); } });
  const failedIds = fast.first.checks.filter((c) => c.status === 'FAIL').map((c) => c.id);
  assert.deepEqual(failedIds, ['V6'], `only loudness should fail: ${JSON.stringify(fast.first.checks)}`);
  assert.equal(fast.ok, true, JSON.stringify(fast.second?.checks));
  assert.deepEqual(calls, [true], 'one audio-only pass, no second full encode');
  assert.equal(videoHash(quiet), pictureBefore, 'the picture is untouched');
  console.log('instagramFinalize.verify ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
