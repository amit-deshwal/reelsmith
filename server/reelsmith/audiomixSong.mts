// RS-603: ducking and loudness on a real song. A 16 s timeline: the song (from SONG_AT s) on a follower track, two spoken
// lines (macOS `say`) on an anchor track at 4-7 s and 7.4-10.4 s. Three exports through the app's server pipeline:
//   mix       song + voice (for listening, and the loudness check after the Instagram re-encode)
//   ducked    the same, voice clips silent (volume 0), so only the duck acts on the song
//   reference the same, the speech track is not an anchor, so nothing ducks
// ducked/reference per 10 ms is the exact gain the duck applied to the song, whatever the music does.
//   npx tsx server/reelsmith/audiomixSong.mts /path/to/song.mp3 [outDir]
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
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

const song = process.argv[2];
if (!song) throw new Error('usage: audiomixSong.mts <song> [outDir]');
const outDir = process.argv[3];
const FPS = 30, SR = 48000, LEN = 16, SONG_AT = Number(process.env.SONG_AT ?? 60), DEPTH = Number(process.env.DUCK_DB ?? -12);
const LINES: Array<[number, number, string]> = [
  [4.0, 7.0, 'We finally made it to the top of the hill.'],
  [7.4, 10.4, 'And honestly, the view is worth every single step.'],
];
const work = mkdtempSync(join(tmpdir(), 'rs-audiomix-song-'));
const media = join(work, 'media');
mkdirSync(media);
setUploadsDirProvider(() => media);
seedKeystore({ MEDIA_DIR: media });
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { maxBuffer: 1 << 28 });

ff('-ss', String(SONG_AT), '-t', String(LEN + 1), '-i', song, '-ar', String(SR), '-c:a', 'aac', '-b:a', '256k', join(media, 'song.m4a'));
LINES.forEach(([from, to, text], i) => {
  execFileSync('say', ['-o', join(work, `line${i}.aiff`), text]);
  ff('-f', 'lavfi', '-i', `color=c=0x303030:s=1080x1920:r=${FPS}:d=${to - from}`, '-i', join(work, `line${i}.aiff`),
    '-af', `aresample=${SR},apad,atrim=0:${to - from},loudnorm=I=-16:TP=-2`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', String(SR), '-t', String(to - from), join(media, `line${i}.mp4`));
});

async function render(name: string, voiceVolume: number, anchor: boolean): Promise<string> {
  const assets: MediaAsset[] = [
    { id: 'song', name: 'song.m4a', kind: 'audio', src: '/media/uploads/song.m4a', durationInFrames: (LEN + 1) * FPS } as MediaAsset,
    ...LINES.map(([from, to], i) => ({ id: `line${i}`, name: `line${i}.mp4`, kind: 'video', src: `/media/uploads/line${i}.mp4`, durationInFrames: Math.round((to - from) * FPS), width: 1080, height: 1920 }) as MediaAsset),
  ];
  let h: History = { past: [], present: emptyProjectDoc(), future: [] };
  h = historyReduce(h, { type: 'batch', label: 'mix', actions: [
    { type: 'setCanvas', width: 1080, height: 1920, fit: 'cover' },
    ...assets.map((asset) => ({ type: 'addAsset', asset })),
    { type: 'track.create', track: { id: 'VS', kind: 'video', name: 'Speech', ...(anchor ? { role: 'anchor' } : {}) } },
    { type: 'track.create', track: { id: 'AM', kind: 'audio', name: 'Music', role: 'follower', audioRouting: { duckDepthDb: DEPTH } } },
    ...LINES.map(([from, to], i) => ({ type: 'add', startFrame: Math.round(from * FPS), item: {
      id: `line${i}`, track: 'VS', kind: 'video', name: `line${i}.mp4`, src: `/media/uploads/line${i}.mp4`, sourceAssetId: `line${i}`,
      durationInFrames: Math.round((to - from) * FPS), volume: voiceVolume } })),
    { type: 'add', startFrame: 0, item: { id: 'song', track: 'AM', kind: 'audio', name: 'song.m4a', src: '/media/uploads/song.m4a', sourceAssetId: 'song',
      durationInFrames: LEN * FPS, fadeInFrames: FPS / 2, fadeOutFrames: FPS } },
  ] } as never);
  const tl = activeTimeline(h.present);
  const submission = await acceptExportSubmission({ state: { ...tl, assets: h.present.assets }, project: h.present, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '1080p' } as never);
  const out = join(work, `${name}.mp4`);
  try { await withExportPermit(() => renderExportPlan(submission.plan, out, () => {})); } finally { await submission.cleanup(); }
  return out;
}

function pcm(file: string): Float32Array {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}
const db = (r: number) => 20 * Math.log10(Math.max(r, 1e-9));
const energy = (x: Float32Array, t0: number, t1: number) => {
  let s = 0; const a = Math.round(t0 * SR), b = Math.min(x.length, Math.round(t1 * SR));
  for (let i = a; i < b; i++) s += x[i]! * x[i]!;
  return s / Math.max(1, b - a);
};
/** gain of `x` against `ref` over [t0, t1), in dB */
const gainDb = (x: Float32Array, ref: Float32Array, t0: number, t1: number) => 10 * Math.log10(energy(x, t0, t1) / Math.max(1e-12, energy(ref, t0, t1)));

const mix = await render('mix', 1, true);
const ducked = await render('ducked', 0, true);
const reference = await render('reference', 0, false);
const d = pcm(ducked), r = pcm(reference);

const step = 0.01;
const curve: number[] = [];
for (let t = 0; t + step <= LEN; t += step) curve.push(gainDb(d, r, t, t + step));
const at = (t: number) => curve[Math.round(t / step)]!;
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
const under = median(curve.slice(Math.round(4.3 / step), Math.round(6.8 / step)));
const gap = Math.max(...curve.slice(Math.round(7.0 / step), Math.round(7.4 / step)));
const open = median(curve.slice(Math.round(1.0 / step), Math.round(3.5 / step)));
const afterOpen = median(curve.slice(Math.round(11.0 / step), Math.round(14.5 / step)));
// ramp: first 10 ms window below -1 dB until the first within 1 dB of the full depth; release the other way round
const firstIdx = (from: number, to: number, ok: (v: number) => boolean) => { for (let i = Math.round(from / step); i < Math.round(to / step); i++) if (ok(curve[i]!)) return i * step; return NaN; };
const attackMs = (firstIdx(3.0, 4.5, (v) => v < under + 1) - firstIdx(3.0, 4.5, (v) => v < -1)) * 1000;
const releaseMs = (firstIdx(10.4, 12, (v) => v > -1) - firstIdx(10.4, 12, (v) => v > under + 1)) * 1000;
let worstJump = 0;
for (let i = Math.round(3 / step); i < Math.round(12 / step); i++) worstJump = Math.max(worstJump, Math.abs(curve[i + 1]! - curve[i]!));

console.log(`song from ${SONG_AT} s, duck depth set ${DEPTH} dB`);
console.log(`open before speech ${open.toFixed(1)} dB | under the voice ${under.toFixed(1)} dB | in the 0.4 s gap between lines ≥ ${gap.toFixed(1)} dB | after ${afterOpen.toFixed(1)} dB`);
console.log(`attack ~${attackMs.toFixed(0)} ms (starts ${(4.0 - firstIdx(3.0, 4.5, (v) => v < -1)).toFixed(2)} s before the voice), release ~${releaseMs.toFixed(0)} ms, largest 10 ms change ${worstJump.toFixed(1)} dB`);
console.log(`gain at 3.70/3.80/3.90/4.00 s: ${[3.7, 3.8, 3.9, 4.0].map((t) => at(t).toFixed(1)).join(' / ')} dB`);

const fin = await finalizeForInstagram(mix, REEL_PRESETS['instagram-reel']!);
const v = await validateReel(mix, { preset: REEL_PRESETS['instagram-reel']! });
const v6 = v.checks.find((c) => c.id === 'V6');
console.log(`mix after Instagram finalize (${fin.reencoded ? 're-encoded' : 'unchanged'}): ${v.checks.map((c) => `${c.id} ${c.status}`).join(' ')} | V6 ${v6?.detail}`);
if (outDir) {
  copyFileSync(mix, join(outDir, 'audiomix-song-mix.mp4'));
  copyFileSync(ducked, join(outDir, 'audiomix-song-music-only-ducked.mp4'));
  console.log(`saved to ${outDir}`);
}
rmSync(work, { recursive: true, force: true });
const ok = under <= -8 && worstJump <= 3 && gap < -6 && v6?.status === 'PASS';
console.log(ok ? 'audiomixSong: ok' : 'audiomixSong: FAILED');
if (!ok) process.exitCode = 1;
