// RS-105: extract scoring features from a video with ffmpeg (no network, no AI).
// Samples frames as small grayscale rawvideo, then computes sharpness, exposure, motion, a centre-subject
// saliency proxy and a dHash; splits windows at hard cuts (shot boundaries); estimates speech from the audio.
import { execFile, spawn } from 'node:child_process';
import { ffmpegBin, ffprobeBin } from '../media-binaries';
import type { ClipFeatures, WindowFeatures } from '../../src/reelsmith/assembler/scoring';

const W = 64;
const H = 64;
const SAMPLE_FPS = 4;
const WINDOW_SEC = 2;
/** Decode video on the GPU on macOS (about 2x faster on 4K HEVC); ffmpeg falls back to software by itself. */
const decodeArgs = (stillImage: boolean) => (!stillImage && process.platform === 'darwin' && process.env.REELSMITH_ANALYSIS_HWACCEL !== '0' ? ['-hwaccel', 'videotoolbox'] : []);

function readGrayFrames(file: string, maxSec: number, stillImage = false): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', ...decodeArgs(stillImage), '-t', String(maxSec), ...(stillImage ? ['-loop', '1'] : []), '-i', file, '-an', '-vf', `fps=${SAMPLE_FPS},scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'];
    const ff = spawn(ffmpegBin(), args);
    const chunks: Buffer[] = [];
    let err = '';
    ff.stdout.on('data', (d: Buffer) => chunks.push(d));
    ff.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}: ${err.slice(-300)}`));
      const all = Buffer.concat(chunks);
      const frames: Buffer[] = [];
      for (let o = 0; o + W * H <= all.length; o += W * H) frames.push(all.subarray(o, o + W * H));
      resolve(frames);
    });
  });
}

/** Mean display colour (0..1) over a few sampled frames, from an 8x8 box-downsample; undefined when ffmpeg cannot read it. */
function readMeanColor(file: string, maxSec: number, stillImage = false): Promise<{ r: number; g: number; b: number } | undefined> {
  return new Promise((resolve) => {
    const ff = spawn(ffmpegBin(), ['-v', 'error', ...decodeArgs(stillImage), '-t', String(maxSec), ...(stillImage ? ['-loop', '1'] : []), '-i', file, '-an', '-vf', `fps=${stillImage ? SAMPLE_FPS : 2},scale=8:8:flags=area,format=rgb24`, '-f', 'rawvideo', '-']);
    const chunks: Buffer[] = [];
    ff.stdout.on('data', (d: Buffer) => chunks.push(d));
    ff.stderr.resume();
    ff.on('error', () => resolve(undefined));
    ff.on('close', () => {
      const all = Buffer.concat(chunks);
      const px = Math.floor(all.length / 3);
      if (!px) return resolve(undefined);
      const sum = [0, 0, 0];
      for (let i = 0; i < px * 3; i += 1) sum[i % 3]! += all[i]!;
      resolve({ r: sum[0]! / px / 255, g: sum[1]! / px / 255, b: sum[2]! / px / 255 });
    });
  });
}

/** Variance of the 4-neighbour Laplacian, squashed to 0..1. */
export function sharpnessOf(f: Buffer): number {
  let sum = 0; let sumSq = 0; let n = 0;
  for (let y = 1; y < H - 1; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      const i = y * W + x;
      const lap = 4 * f[i]! - f[i - 1]! - f[i + 1]! - f[i - W]! - f[i + W]!;
      sum += lap; sumSq += lap * lap; n += 1;
    }
  }
  const variance = sumSq / n - (sum / n) ** 2;
  return Math.max(0, Math.min(1, Math.log10(1 + variance) / 3));
}

/** 1 when the mean is mid-grey and few pixels are crushed/blown. */
export function exposureOf(f: Buffer): number {
  let sum = 0; let clipped = 0;
  for (const v of f) { sum += v; if (v < 8 || v > 247) clipped += 1; }
  const mean = sum / f.length / 255;
  return Math.max(0, 1 - Math.abs(mean - 0.45) * 2) * (1 - Math.min(1, (clipped / f.length) * 2));
}

export function motionBetween(a: Buffer, b: Buffer): number {
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d += Math.abs(a[i]! - b[i]!);
  return Math.min(1, d / a.length / 255 * 8);
}

/** 16-bin grey histogram distance, 0 (same) .. 1 (disjoint). */
export function histDistance(a: Buffer, b: Buffer): number {
  const ha = new Array<number>(16).fill(0);
  const hb = new Array<number>(16).fill(0);
  for (let i = 0; i < a.length; i += 1) { ha[a[i]! >> 4]! += 1; hb[b[i]! >> 4]! += 1; }
  let d = 0;
  for (let i = 0; i < 16; i += 1) d += Math.abs(ha[i]! - hb[i]!);
  return d / (2 * a.length);
}

/** Indices i where frame i starts a new shot (hard cut between i-1 and i). */
export function shotBoundaries(frames: Buffer[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < frames.length; i += 1) {
    if (histDistance(frames[i - 1]!, frames[i]!) > 0.45 && motionBetween(frames[i - 1]!, frames[i]!) > 0.5) out.push(i);
  }
  return out;
}

/**
 * RS-1217: cuts in an edited reel (a reference), more sensitive than shotBoundaries: a frame whose histogram jumps
 * (> 0.2) and at least 2.5x more than the frames either side of it. Inside a shot the jump stays under ~0.1 even on
 * handheld footage; between two shots of similar trek footage it is 0.24-0.43, which the clip rule (0.45 and motion)
 * misses. Motion is no help here: handheld footage saturates it inside a shot.
 */
export function peakCuts(frames: Buffer[]): number[] {
  const h = frames.map((f, i) => (i ? histDistance(frames[i - 1]!, f) : 0));
  const out: number[] = [];
  for (let i = 1; i < frames.length; i += 1) {
    if (h[i]! > 0.2 && h[i]! >= 2.5 * Math.max(h[i - 1] ?? 0, h[i + 1] ?? 0, 0.02)) out.push(i);
  }
  return out;
}

/** A reference reel's cuts (in frames at `fps`) and its mean colour over the whole reel, not just its opening. */
export async function extractReferenceCuts(file: string, fps: number, maxSec = 90): Promise<{ cutsFrame: number[]; color?: { r: number; g: number; b: number } }> {
  const [frames, color] = await Promise.all([readGrayFrames(file, maxSec), readMeanColor(file, maxSec)]);
  return { cutsFrame: peakCuts(frames).map((i) => Math.round((i / SAMPLE_FPS) * fps)), ...(color ? { color } : {}) };
}

/**
 * Saliency proxy for "is there a subject": edge density in the centre half of the frame relative to the
 * border. A clear subject in the middle on a calmer background scores high; a uniform texture scores ~0.
 * (Real face detection runs in the browser later; this keeps the server model-free.)
 */
export function subjectOf(f: Buffer): number {
  let centre = 0; let border = 0; let nc = 0; let nb = 0;
  for (let y = 1; y < H - 1; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      const i = y * W + x;
      const g = Math.abs(f[i + 1]! - f[i - 1]!) + Math.abs(f[i + W]! - f[i - W]!);
      const inCentre = x >= W / 4 && x < (3 * W) / 4 && y >= H / 4 && y < (3 * H) / 4;
      if (inCentre) { centre += g; nc += 1; } else { border += g; nb += 1; }
    }
  }
  const c = centre / nc; const b = border / nb;
  if (c < 4) return 0;
  return Math.max(0, Math.min(1, (c - b) / (c + b + 1e-6)));
}

const AUDIO_RATE = 8000;
const AUDIO_HOP = 160; // 20 ms

/** Speech-band (300-3400 Hz) mono PCM; empty when the file has no audio. */
function readSpeechBand(file: string, maxSec: number): Promise<Int16Array> {
  return new Promise((resolve) => {
    const ff = spawn(ffmpegBin(), ['-v', 'error', '-t', String(maxSec), '-i', file, '-vn', '-ac', '1', '-ar', String(AUDIO_RATE),
      '-af', 'highpass=f=300,lowpass=f=3400', '-f', 's16le', '-']);
    const chunks: Buffer[] = [];
    ff.stdout.on('data', (d: Buffer) => chunks.push(d));
    ff.stderr.resume();
    ff.on('error', () => resolve(new Int16Array(0)));
    ff.on('close', () => {
      const all = Buffer.concat(chunks);
      resolve(new Int16Array(all.buffer, all.byteOffset, Math.floor(all.length / 2)));
    });
  });
}

/**
 * Speech per time range: speech is loud enough, comes and goes at syllable rate, and is neither
 * silent nor a steady tone/music bed. Returns, per 20 ms hop, whether it is voiced, plus the decision helper.
 */
export function speechDetector(pcm: Int16Array): (startSec: number, endSec: number) => boolean {
  const hops = Math.floor(pcm.length / AUDIO_HOP);
  const db = new Float64Array(hops);
  for (let h = 0; h < hops; h += 1) {
    let sq = 0;
    for (let i = h * AUDIO_HOP; i < (h + 1) * AUDIO_HOP; i += 1) sq += (pcm[i]! / 32768) ** 2;
    db[h] = 10 * Math.log10(sq / AUDIO_HOP + 1e-10);
  }
  const sorted = [...db].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -100;
  return (startSec, endSec) => {
    const a = Math.max(0, Math.floor((startSec * AUDIO_RATE) / AUDIO_HOP));
    const b = Math.min(hops, Math.ceil((endSec * AUDIO_RATE) / AUDIO_HOP));
    if (b - a < 10) return false;
    let active = 0; let flips = 0; let prev = false; let peak = -100;
    for (let h = a; h < b; h += 1) {
      const on = db[h]! > Math.max(floor + 12, -45);
      if (on) active += 1;
      if (h > a && on !== prev) flips += 1;
      prev = on; peak = Math.max(peak, db[h]!);
    }
    const ratio = active / (b - a);
    const flipsPerSec = flips / ((b - a) * AUDIO_HOP / AUDIO_RATE);
    // talking: on 30-90% of the time, switching on/off a few times a second
    return peak > -35 && ratio > 0.3 && ratio < 0.92 && flipsPerSec > 1.5 && flipsPerSec < 14;
  };
}

/** RS-1251: share of whole seconds that are speech (a narration reads ~0.8, a song with a steady bed far less). */
export function speechShareOfPcm(pcm: Int16Array): number | null {
  const secs = Math.floor(pcm.length / AUDIO_RATE);
  if (secs < 2) return null;
  const isSpeech = speechDetector(pcm);
  let on = 0;
  for (let t = 0; t < secs; t += 1) if (isSpeech(t, t + 1)) on += 1;
  return Math.round((on / secs) * 100) / 100;
}

/** RS-1251: speech share of a file's first three minutes; null when it has no sound. */
export async function speechShareOf(file: string): Promise<number | null> {
  return speechShareOfPcm(await readSpeechBand(file, 180));
}

/** 64-bit dHash on a 9x8 box-downsample of a 64x64 gray frame. */
export function dHashOf(f: Buffer): string {
  const cw = 7; const ch = 8; // 9 columns of ~7px, 8 rows of 8px
  const cell = (cx: number, cy: number) => {
    let s = 0; let n = 0;
    for (let y = cy * ch; y < (cy + 1) * ch; y += 1) for (let x = cx * cw; x < Math.min(W, (cx + 1) * cw); x += 1) { s += f[y * W + x]!; n += 1; }
    return s / n;
  };
  let bits = '';
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bits += cell(x, y) > cell(x + 1, y) ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

interface ClipMetadata {
  format?: { tags?: Record<string, string>; duration?: string };
  streams?: Array<{ codec_type?: string; duration?: string; tags?: Record<string, string> }>;
}

/** Prefer the camera's QuickTime date over the container's creation date. Missing zones mean UTC. */
export function captureTimeFromMetadata(metadata: ClipMetadata): number | undefined {
  const tags = [metadata.format?.tags, ...(metadata.streams ?? []).map((stream) => stream.tags)]
    .map((entry) => Object.fromEntries(Object.entries(entry ?? {}).map(([key, value]) => [key.toLowerCase(), value])));
  for (const key of ['com.apple.quicktime.creationdate', 'creation_time', 'date']) {
    for (const entry of tags) {
      const value = entry[key];
      if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) continue;
      const time = Date.parse(/(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);
      if (Number.isFinite(time)) return time;
    }
  }
  return undefined;
}

function readMetadata(file: string): Promise<ClipMetadata> {
  return new Promise((resolve) => {
    execFile(ffprobeBin(), ['-v', 'error', '-show_entries', 'format=duration:format_tags:stream=codec_type,duration:stream_tags', '-of', 'json', file],
      { timeout: 10_000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) { resolve({}); return; }
        try { resolve(JSON.parse(stdout) as ClipMetadata); } catch { resolve({}); }
      });
  });
}

export async function extractClipFeatures(
  file: string, assetId: string, fps: number, opts: { maxSec?: number; captureTimeMs?: number; stillImage?: boolean } = {},
): Promise<ClipFeatures> {
  const maxSec = opts.stillImage ? 1 / SAMPLE_FPS : opts.maxSec ?? 120;
  const [frames, pcm, metadata, color] = await Promise.all([
    readGrayFrames(file, maxSec, opts.stillImage),
    opts.stillImage ? Promise.resolve(new Int16Array(0)) : readSpeechBand(file, maxSec),
    readMetadata(file),
    readMeanColor(file, Math.min(maxSec, 4), opts.stillImage),
  ]);
  if (!frames.length) throw new Error('No video frames could be analysed');
  const durationSec = Number(metadata.streams?.find((stream) => stream.codec_type === 'video')?.duration ?? metadata.format?.duration);
  const lastFrame = Number.isFinite(durationSec) && durationSec > 0 ? Math.floor(durationSec * fps) : Infinity;
  const isSpeech = speechDetector(pcm);
  const perWindow = WINDOW_SEC * SAMPLE_FPS;
  const cuts = shotBoundaries(frames);
  const shots: Array<[number, number]> = [];
  [0, ...cuts].forEach((start, i) => shots.push([start, cuts[i] ?? frames.length]));
  const windows: WindowFeatures[] = [];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : 0);
  for (const [shotStart, shotEnd] of shots) {
    // windows never cross a cut; a short leftover at the end of a shot is still a window
    for (let s = shotStart; s < shotEnd; s += perWindow) {
      const slice = frames.slice(s, Math.min(s + perWindow, shotEnd));
      if (!slice.length) break;
      const motions = slice.slice(1).map((f, i) => motionBetween(slice[i]!, f));
      windows.push({
        startFrame: Math.round((s / SAMPLE_FPS) * fps),
        endFrame: Math.min(lastFrame, Math.round(((s + slice.length) / SAMPLE_FPS) * fps)),
        sharpness: mean(slice.map(sharpnessOf)),
        exposure: mean(slice.map(exposureOf)),
        motion: mean(motions),
        subject: mean(slice.map(subjectOf)),
        speech: isSpeech(s / SAMPLE_FPS, (s + slice.length) / SAMPLE_FPS),
      });
    }
  }
  const mid = frames[Math.floor(frames.length / 2)];
  return {
    assetId, dHash: mid ? dHashOf(mid) : '0'.repeat(16), captureTimeMs: opts.captureTimeMs ?? captureTimeFromMetadata(metadata), windows, ...(color ? { color } : {}),
    shotBoundariesFrame: cuts.map((i) => Math.round((i / SAMPLE_FPS) * fps)),
  };
}
