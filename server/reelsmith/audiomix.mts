// RS-603: ducking depth, fades and loudness in a real export.
// A 6 s timeline: music (440 Hz, follower track, fade in/out 0.5 s) under a "speech" clip (1 kHz, anchor track, 2-4 s).
// Exports through the app's server pipeline, then measures each tone with a Goertzel filter.
// SPEECH=voice uses a spoken sentence (macOS `say`) instead of the 1 kHz tone.
//   npx tsx server/reelsmith/audiomix.mts
//   SPEECH=voice npx tsx server/reelsmith/audiomix.mts
import { execFileSync } from 'node:child_process';
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, type MediaAsset } from '../../src/editor/types.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { renderExportPlan, setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { withExportPermit } from '../plugins/export-runtime.ts';
import { seedKeystore } from '../keystore.ts';
import { REEL_PRESETS } from '../../shared/reelsmith/instagramPreset.ts';
import { finalizeForInstagram } from './instagramFinalize.ts';
import { validateReel } from './exportValidate.ts';

const FPS = 30;
const SR = 48000;
const work = mkdtempSync(join(tmpdir(), 'rs-audiomix-'));
const media = join(work, 'media');
mkdirSync(media);
setUploadsDirProvider(() => media);
seedKeystore({ MEDIA_DIR: media });
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { maxBuffer: 1 << 28 });

// sources
ff('-f', 'lavfi', '-i', `sine=f=440:r=${SR}:d=6`, '-af', 'volume=0.5', '-c:a', 'aac', join(media, 'music.m4a'));
const VOICE = process.env.SPEECH === 'voice';
if (VOICE) execFileSync('say', ['-o', join(work, 'voice.aiff'), 'We finally made it to the top, and the view is worth every step.']);
const speechIn = VOICE
  ? ['-i', join(work, 'voice.aiff'), '-af', 'aresample=48000,apad,atrim=0:2,loudnorm=I=-16:TP=-2']
  : ['-f', 'lavfi', '-i', `sine=f=1000:r=${SR}:d=2`, '-af', 'volume=0.5'];
ff('-f', 'lavfi', '-i', 'color=c=0x303030:s=1080x1920:r=30:d=2', ...speechIn,
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', String(SR), '-t', '2', join(media, 'speech.mp4'));

const musicAsset = { id: 'music', name: 'music.m4a', kind: 'audio', src: '/media/uploads/music.m4a', durationInFrames: 6 * FPS } as MediaAsset;
const speechAsset = { id: 'speech', name: 'speech.mp4', kind: 'video', src: '/media/uploads/speech.mp4', durationInFrames: 2 * FPS, width: 1080, height: 1920 } as MediaAsset;
const DEPTH = Number(process.env.DUCK_DB ?? -12);
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
h = historyReduce(h, { type: 'batch', label: 'mix', actions: [
  { type: 'setCanvas', width: 1080, height: 1920, fit: 'cover' },
  { type: 'addAsset', asset: musicAsset }, { type: 'addAsset', asset: speechAsset },
  { type: 'track.create', track: { id: 'VS', kind: 'video', name: 'Speech', role: 'anchor' } },
  { type: 'track.create', track: { id: 'AM', kind: 'audio', name: 'Music', role: 'follower', audioRouting: { duckDepthDb: DEPTH } } },
  { type: 'add', startFrame: 2 * FPS, item: { id: 'speech', track: 'VS', kind: 'video', name: 'speech.mp4', src: speechAsset.src, sourceAssetId: 'speech', durationInFrames: 2 * FPS } },
  { type: 'add', startFrame: 0, item: { id: 'music', track: 'AM', kind: 'audio', name: 'music.m4a', src: musicAsset.src, sourceAssetId: 'music', durationInFrames: 6 * FPS, fadeInFrames: FPS / 2, fadeOutFrames: FPS / 2 } },
] } as never);
const tl = activeTimeline(h.present);
const submission = await acceptExportSubmission({ state: { ...tl, assets: h.present.assets }, project: h.present, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '1080p' } as never);
const out = join(work, 'mix.mp4');
try { await withExportPermit(() => renderExportPlan(submission.plan, out, () => {})); } finally { await submission.cleanup(); }

function pcm(file: string): Float32Array {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}
/** Amplitude of one tone over [t0, t1) seconds. */
function tone(x: Float32Array, f: number, t0: number, t1: number): number {
  const a = Math.round(t0 * SR), b = Math.min(x.length, Math.round(t1 * SR));
  let re = 0, im = 0;
  for (let i = a; i < b; i++) { const w = 2 * Math.PI * f * (i / SR); re += x[i]! * Math.cos(w); im += x[i]! * Math.sin(w); }
  return (2 * Math.hypot(re, im)) / (b - a);
}
const db = (r: number) => 20 * Math.log10(Math.max(r, 1e-9));

// with a voice, how much of the 440 Hz reading is the voice itself (it bounds how deep a duck can be measured)
const voiceLeak = VOICE ? db(tone(pcm(join(media, 'speech.mp4')), 440, 0.2, 1.8)) : -Infinity;
// the duck ramps in over 0.2 s before the speech (from 1.8 s) and recovers over 0.4 s after it (to 4.4 s)
async function report(label: string, file: string): Promise<{ duck: number; fadeIn: number; fadeOut: number; speechDelta: number; rampMs: number }> {
  const x = pcm(file);
  const before = tone(x, 440, 1.0, 1.7), during = tone(x, 440, 2.2, 3.8), after = tone(x, 440, 4.6, 5.3);
  const speechIn = tone(x, 1000, 2.2, 3.8), speechPre = tone(x, 1000, 1.0, 1.9);
  const start = tone(x, 440, 0.0, 0.05), mid = tone(x, 440, 0.25, 0.3), full = before, end = tone(x, 440, 5.95, 6.0), pre = tone(x, 440, 5.45, 5.5);
  // ramp: first 10 ms window at 2.0 s that is within 1 dB of the final ducked level, minus the first window that left the open level
  const step = 0.005; let left = -1, arrive = -1;
  for (let t = 1.6; t < 2.4; t += step) {
    const lvl = db(tone(x, 440, t, t + step)) - db(before);
    if (left < 0 && lvl < -1) left = t;
    if (arrive < 0 && lvl < db(during) - db(before) + 1) arrive = t;
  }
  const r = { duck: db(during) - db(before), fadeIn: db(start) - db(full), fadeOut: db(end) - db(pre), speechDelta: db(speechIn) - db(speechPre), rampMs: Math.max(0, (arrive - left) * 1000) };
  console.log(`${label}: music under ${VOICE ? 'voice' : 'speech tone'} ${r.duck.toFixed(1)} dB (set ${DEPTH}); after speech ${(db(after) - db(before)).toFixed(1)} dB; fade-in start ${r.fadeIn.toFixed(1)} dB, mid ${(db(mid) - db(full)).toFixed(1)} dB; fade-out end ${r.fadeOut.toFixed(1)} dB; duck ramp ~${r.rampMs.toFixed(0)} ms${VOICE ? `; voice at 440 Hz ${(voiceLeak - db(before)).toFixed(1)} dB` : `; speech tone ${r.speechDelta.toFixed(1)} dB`}`);
  return r;
}
const raw = await report('raw export', out);
if (process.env.KEEP_RAW) copyFileSync(out, process.env.KEEP_RAW);
const fin = await finalizeForInstagram(out, REEL_PRESETS['instagram-reel']!);
const after = await report(`after Instagram finalize (${fin.reencoded ? 're-encoded' : 'unchanged'})`, out);
const v = await validateReel(out, { preset: REEL_PRESETS['instagram-reel']!, intendedBlack: [[0, 6]] as never });
console.log('V3/V6/V9:', v.checks.filter((c) => c.id === 'V3' || c.id === 'V6' || c.id === 'V9').map((c) => `${c.id} ${c.status} ${c.detail}`).join(' | '));
rmSync(work, { recursive: true, force: true });
const v6 = v.checks.find((c) => c.id === 'V6');
const v9 = v.checks.find((c) => c.id === 'V9');
const ok = raw.duck <= -8 && after.duck <= -8 && after.fadeIn < -20 && after.fadeOut < -20 && raw.rampMs >= 100 && v6?.status === 'PASS' && v9?.status !== 'FAIL';
console.log(ok ? 'audiomix: ok' : 'audiomix: FAILED');
if (!ok) process.exitCode = 1;
