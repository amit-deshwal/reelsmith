// RS-105: extract scoring features from a video with ffmpeg (no network, no AI).
// Samples frames as small grayscale rawvideo, then computes sharpness, exposure, motion and a dHash.
import { spawn } from 'node:child_process';
import type { ClipFeatures, WindowFeatures } from '../../src/reelsmith/assembler/scoring';

const W = 64;
const H = 64;
const SAMPLE_FPS = 4;
const WINDOW_SEC = 2;

function readGrayFrames(file: string, maxSec: number): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-t', String(maxSec), '-i', file, '-an', '-vf', `fps=${SAMPLE_FPS},scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'];
    const ff = spawn('ffmpeg', args);
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

export async function extractClipFeatures(
  file: string, assetId: string, fps: number, opts: { maxSec?: number; captureTimeMs?: number } = {},
): Promise<ClipFeatures> {
  const frames = await readGrayFrames(file, opts.maxSec ?? 120);
  const perWindow = WINDOW_SEC * SAMPLE_FPS;
  const windows: WindowFeatures[] = [];
  for (let s = 0; s < frames.length; s += perWindow) {
    const slice = frames.slice(s, s + perWindow);
    if (!slice.length) break;
    const mean = (xs: number[]) => (xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : 0);
    const motions = slice.slice(1).map((f, i) => motionBetween(slice[i]!, f));
    windows.push({
      startFrame: Math.round((s / SAMPLE_FPS) * fps),
      endFrame: Math.round(((s + slice.length) / SAMPLE_FPS) * fps),
      sharpness: mean(slice.map(sharpnessOf)),
      exposure: mean(slice.map(exposureOf)),
      motion: mean(motions),
      subject: 0, // face/saliency detection plugs in here later
      speech: false,
    });
  }
  const mid = frames[Math.floor(frames.length / 2)];
  return { assetId, dHash: mid ? dHashOf(mid) : '0'.repeat(16), captureTimeMs: opts.captureTimeMs, windows };
}
