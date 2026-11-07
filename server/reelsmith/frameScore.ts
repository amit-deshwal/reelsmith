// RS-1234: how good a frame of the export is as the reel's cover. The cover used to be a fixed moment (45% into the
// longest section with no line), which on the trek reel (2026-11-08) was a crowd shot with an out-of-focus cap filling
// the bottom third. Measured on a small copy of each candidate frame: detail spread over the frame (a blurry
// foreground or a smeared mid-transition frame has big flat areas), exposure and colour.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegBin } from '../media-binaries.ts';

const run = promisify(execFile);

/** Width of the copy each frame is scored on. */
export const SCORE_WIDTH = 72;
/** The thirds of the 3:4 grid crop the cover's title can sit in (`TITLE_BANDS` in src/reelsmith/exportCover.ts). */
const TITLE_BANDS = [0.2, 0.5, 0.8];
const COLS = 4;
const ROWS = 6;

export interface FrameScore { score: number; sharp: number; clean: number; exposure: number; colour: number }

/**
 * A score in 0..1 for an RGB frame (`rgb` is w*h*3 bytes): a sharp subject with a calm area for the title. Sharpness is
 * the mean gradient of the sharper half of a 4x6 grid of tiles (the subject, wherever it is). Clean is how much calmer
 * the calmest third of the 3:4 grid crop (the bands the cover's title can sit in) is than that: sky, water, a wall. A
 * busy frame (an arcade, a crowd) has no such band; plain detail and colour picked exactly those (trek reel, 2026-11-08).
 * Exposure falls off when the frame is mostly dark or blown; colour is the Hasler-Süsstrunk measure, saturating.
 */
export function scoreFrame(rgb: ArrayLike<number>, w: number, h: number): FrameScore {
  const n = w * h;
  if (n < 16 || rgb.length < n * 3) return { score: 0, sharp: 0, clean: 0, exposure: 0, colour: 0 };
  const luma = new Float32Array(n);
  let sumL = 0, rg = 0, yb = 0, rg2 = 0, yb2 = 0, clipped = 0;
  for (let i = 0; i < n; i += 1) {
    const r = rgb[i * 3]!, g = rgb[i * 3 + 1]!, b = rgb[i * 3 + 2]!;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[i] = y;
    sumL += y;
    if (y < 16 || y > 245) clipped += 1;
    const a = r - g, c = 0.5 * (r + g) - b;
    rg += a; yb += c; rg2 += a * a; yb2 += c * c;
  }
  const detail = (x0: number, x1: number, y0: number, y1: number) => {
    let s = 0, m = 0;
    for (let y = Math.max(1, y0); y < Math.min(h - 1, y1); y += 1) for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x += 1) {
      const i = y * w + x;
      s += Math.abs(luma[i + 1]! - luma[i - 1]!) + Math.abs(luma[i + w]! - luma[i - w]!);
      m += 1;
    }
    return m ? s / m : 0;
  };
  const tiles: number[] = [];
  for (let ty = 0; ty < ROWS; ty += 1) for (let tx = 0; tx < COLS; tx += 1) {
    tiles.push(detail(Math.floor((tx * w) / COLS), Math.floor(((tx + 1) * w) / COLS), Math.floor((ty * h) / ROWS), Math.floor(((ty + 1) * h) / ROWS)));
  }
  tiles.sort((a, b) => b - a);
  const top = tiles.slice(0, tiles.length / 2).reduce((a, b) => a + b, 0) / (tiles.length / 2);
  const gridH = Math.min(h, (w * 4) / 3), gridTop = (h - gridH) / 2;
  const calmest = Math.min(...TITLE_BANDS.map((at) => detail(0, w, Math.round(gridTop + gridH * (at - 0.12)), Math.round(gridTop + gridH * (at + 0.12)))));
  const clean = top > 0 ? Math.max(0, 1 - calmest / top) : 0;
  const sharp = Math.min(1, top / 40);
  const mean = sumL / n;
  const exposure = Math.max(0, 1 - Math.max(0, Math.abs(mean - 125) - 40) / 70) * (1 - Math.min(0.6, clipped / n));
  const mrg = rg / n, myb = yb / n;
  const colourful = Math.sqrt(Math.max(0, rg2 / n - mrg * mrg) + Math.max(0, yb2 / n - myb * myb)) + 0.3 * Math.hypot(mrg, myb);
  const colour = Math.min(1, colourful / 60);
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return { score: r3(sharp * (0.3 + 0.7 * clean) * exposure * (0.7 + 0.3 * colour)), sharp: r3(sharp), clean: r3(clean), exposure: r3(exposure), colour: r3(colour) };
}

/** One small RGB copy of the frame at `atSec`, decoded by ffmpeg (which applies the file's rotation). */
export async function frameRgb(file: string, atSec: number): Promise<{ rgb: Buffer; w: number; h: number } | null> {
  const { stdout } = await run(ffmpegBin(), ['-v', 'error', '-ss', String(Math.max(0, atSec)), '-i', file, '-frames:v', '1',
    '-vf', `scale=${SCORE_WIDTH}:-2:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { timeout: 60_000, encoding: 'buffer', maxBuffer: 1 << 22 });
  if (!stdout.length || stdout.length % (SCORE_WIDTH * 3)) return null;
  return { rgb: stdout, w: SCORE_WIDTH, h: stdout.length / (SCORE_WIDTH * 3) };
}

/** The score of each moment of `file` (0 for a frame that could not be read). */
export async function frameScores(file: string, times: readonly number[]): Promise<FrameScore[]> {
  const none = { score: 0, sharp: 0, clean: 0, exposure: 0, colour: 0 };
  return Promise.all(times.map(async (t) => {
    try {
      const f = await frameRgb(file, t);
      return f ? scoreFrame(f.rgb, f.w, f.h) : none;
    } catch { return none; }
  }));
}
