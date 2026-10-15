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

  // shot boundaries: a hard cut at 2 s splits the windows there
  const cut = join(dir, 'cut.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30:d=2', '-f', 'lavfi', '-i', 'color=c=red:size=320x240:rate=30:d=2',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', cut]);
  const c = await extractClipFeatures(cut, 'cut', 30);
  assert.equal(c.shotBoundariesFrame?.length, 1, JSON.stringify(c.shotBoundariesFrame));
  const at = c.shotBoundariesFrame![0]!;
  assert.ok(Math.abs(at - 60) <= 8, `cut found at ${at}`);
  assert.ok(c.windows.every((w) => !(w.startFrame < at && w.endFrame > at)), 'no window spans the cut');
  assert.equal(a.shotBoundariesFrame?.length, 0, 'a continuous clip has no cuts');

  // subject: a detailed centre on a flat background beats a uniform texture
  const centred = join(dir, 'centred.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:size=320x240:rate=30:d=2', '-f', 'lavfi', '-i', 'testsrc2=size=120x100:rate=30:d=2',
    '-filter_complex', '[0:v][1:v]overlay=100:70', '-pix_fmt', 'yuv420p', centred]);
  const s = await extractClipFeatures(centred, 'centred', 30);
  assert.ok(s.windows[0]!.subject > 0.3, `centred subject ${s.windows[0]!.subject}`);
  assert.ok(f.windows[0]!.subject === 0, 'flat frame has no subject');

  // speech: syllable-like bursts in the voice band count as speech; a steady tone and silence do not
  const withAudio = (name: string, audio: string) => {
    const out = join(dir, name);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:size=160x120:rate=30:d=4', '-f', 'lavfi', '-i', audio,
      '-t', '4', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
    return out;
  };
  const talk = withAudio('talk.mp4', "anoisesrc=color=pink:amplitude=0.4:d=4,volume='if(lt(mod(t,0.31),0.17),1,0.003)':eval=frame");
  const tone = withAudio('tone.mp4', 'sine=frequency=1000:duration=4');
  const [ft, fo] = await Promise.all([extractClipFeatures(talk, 'talk', 30), extractClipFeatures(tone, 'tone', 30)]);
  assert.ok(ft.windows.some((w) => w.speech), 'bursty voice-band audio reads as speech');
  assert.ok(fo.windows.every((w) => !w.speech), 'a steady tone is not speech');
  assert.ok(f.windows.every((w) => !w.speech), 'no audio, no speech');
  console.log('clipFeatures.verify: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
