// RS-1265: a hard cut does not click in a real export.
// Two clips of one 317.3 Hz tone butted at 2.0 s; the second starts 7 frames into the source, so the waveform jumps
// about half a cycle at the cut. Each case exports through the app's server pipeline and compares the sharpest
// second difference within ±15 ms of the cut with the steady tone's (a pure low tone has almost none; a click is
// broadband). Without the 10 ms edge fade (patches/@remotion+media+*.patch) a video cut measured 160x and an audio
// cut 134x; a one-frame clip fade does not help (Remotion sets volume once per frame: 115x plus a 33 ms hole).
//   node --import tsx server/reelsmith/seamClick.verify.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegBin } from '../media-binaries.ts';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, type MediaAsset } from '../../src/editor/types.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { renderExportPlan, setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { withExportPermit } from '../plugins/export-runtime.ts';
import { seedKeystore } from '../keystore.ts';

const FPS = 30;
const SR = 48000;
const F = 317.3;
const work = mkdtempSync(join(tmpdir(), 'rs-seamclick-'));
const media = join(work, 'media');
mkdirSync(media);
setUploadsDirProvider(() => media);
seedKeystore({ MEDIA_DIR: media });
const ff = (...a: string[]) => execFileSync(ffmpegBin(), ['-v', 'error', '-y', ...a], { maxBuffer: 1 << 28 });

ff('-f', 'lavfi', '-i', 'color=c=0x303030:s=1080x1920:r=30:d=4', '-f', 'lavfi', '-i', `sine=f=${F}:r=${SR}:d=4`,
  '-af', 'volume=0.5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '320k', '-ar', String(SR), '-t', '4', join(media, 'tone.mp4'));
const asset = { id: 'tone', name: 'tone.mp4', kind: 'video', src: '/media/uploads/tone.mp4', durationInFrames: 4 * FPS, width: 1080, height: 1920 } as MediaAsset;

interface Seam { ratio: number; dipMs: number; level: number }

/** Export two butted pieces and measure the cut. `audio`: audio clips instead of video; `split`: B carries straight on from A. */
async function measure(label: string, { audio = false, split = false } = {}): Promise<Seam> {
  const track = audio ? 'A1' : 'V1';
  const clip = (id: string, startFrame: number, srcInFrame: number) => ({ type: 'add', startFrame, item: {
    id, track, kind: audio ? 'audio' : 'video', name: 'tone.mp4', src: asset.src, sourceAssetId: 'tone', durationInFrames: 2 * FPS, srcInFrame,
  } });
  let h: History = { past: [], present: emptyProjectDoc(), future: [] };
  h = historyReduce(h, { type: 'batch', label: 'seam', actions: [
    { type: 'setCanvas', width: 1080, height: 1920, fit: 'cover' },
    { type: 'addAsset', asset },
    { type: 'track.create', track: { id: track, kind: audio ? 'audio' : 'video', name: audio ? 'Sound' : 'Video' } },
    clip('a', 0, 0), clip('b', 2 * FPS, split ? 2 * FPS : 7),
  ] } as never);
  const tl = activeTimeline(h.present);
  const submission = await acceptExportSubmission({ state: { ...tl, assets: h.present.assets }, project: h.present, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '1080p' } as never);
  const out = join(work, `${label.replace(/\W+/g, '-')}.mp4`);
  try { await withExportPermit(() => renderExportPlan(submission.plan, out, () => {})); } finally { await submission.cleanup(); }

  const buf = execFileSync(ffmpegBin(), ['-v', 'error', '-i', out, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const d2 = (t0: number, t1: number) => {
    let m = 0;
    for (let i = Math.max(2, Math.round(t0 * SR)); i < Math.min(x.length, Math.round(t1 * SR)); i++) m = Math.max(m, Math.abs(x[i]! - 2 * x[i - 1]! + x[i - 2]!));
    return m;
  };
  const rms = (t0: number, t1: number) => { let s = 0, n = 0; for (let i = Math.round(t0 * SR); i < Math.round(t1 * SR); i++) { s += x[i]! ** 2; n++; } return Math.sqrt(s / Math.max(1, n)); };
  const db = (r: number) => 20 * Math.log10(Math.max(r, 1e-9));
  const ratio = d2(1.985, 2.015) / Math.max(d2(0.5, 1.5), d2(2.5, 3.5), 1e-9);
  let dipMs = 0;
  for (let t = 1.9; t < 2.1; t += 0.001) if (db(rms(t, t + 0.001)) - db(rms(0.5, 1.5)) < -12) dipMs += 1;
  const r = { ratio, dipMs, level: db(rms(0.5, 1.5)) };
  console.log(`${label}: cut ${r.ratio.toFixed(1)}x the steady tone, >12 dB down for ~${r.dipMs} ms, tone ${r.level.toFixed(1)} dBFS`);
  return r;
}

let failed = false;
const check = (ok: boolean, what: string) => { if (!ok) { failed = true; console.error(`FAIL: ${what}`); } };
try {
  const video = await measure('video cut');
  check(video.ratio < 3, 'a cut between two video clips clicks');
  check(video.dipMs <= 12, 'a video cut leaves a hole longer than the 10 ms fade');
  const audio = await measure('audio cut', { audio: true });
  check(audio.ratio < 3, 'a cut between two audio clips clicks');
  check(audio.dipMs <= 12, 'an audio cut leaves a hole longer than the 10 ms fade');
  check(Math.abs(audio.level - video.level) < 1, 'audio clips and video sound play the same source at different levels');
  const split = await measure('plain split', { split: true });
  check(split.ratio < 3 && split.dipMs <= 2, 'a plain split (no jump) dips or clicks');
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(failed ? 'seamClick: FAILED' : 'seamClick: ok');
if (failed) process.exitCode = 1;
