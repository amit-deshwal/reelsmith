// A still of one moment of a video, saved next to it in the uploads folder (reels_freeze_frame). The editor has no
// "hold this frame" for video: a near-zero speed still crawls and reads as slow motion, so a freeze is a real image.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { ffmpegBin } from '../media-binaries.ts';
import { jpegSize } from '../frame-grid.ts';

const run = promisify(execFile);

export interface Still { name: string; width: number; height: number }

/** File name of the still at `atSec` of `sourceName` (milliseconds, so one moment is extracted once). */
export function stillName(sourceName: string, atSec: number): string {
  return `${basename(sourceName, extname(sourceName))}.still-${Math.max(0, Math.round(atSec * 1000))}.jpg`;
}

/** RS-1234: one full-size frame as JPEG bytes, not saved anywhere (the export's cover is drawn from it). */
export async function frameJpeg(file: string, atSec: number): Promise<{ base64: string; width: number; height: number }> {
  const { stdout } = await run(ffmpegBin(), ['-v', 'error', '-ss', String(Math.max(0, atSec)), '-i', file, '-frames:v', '1', '-q:v', '2', '-f', 'image2pipe', '-c:v', 'mjpeg', '-'],
    { timeout: 60_000, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  const size = jpegSize(stdout);
  if (!size) throw new Error(`could not read the frame of ${basename(file)} at ${atSec} s`);
  return { base64: stdout.toString('base64'), ...size };
}

export async function extractStill(file: string, atSec: number): Promise<Still> {
  const name = stillName(file, atSec);
  const out = join(dirname(file), name);
  // a cached still is reused only when it is newer than the video it came from
  const fresh = existsSync(out) && (await stat(out)).mtimeMs >= (await stat(file)).mtimeMs;
  if (!fresh) {
    // input seeking is frame-accurate when decoding; ffmpeg applies the phone's rotation by itself
    await run(ffmpegBin(), ['-v', 'error', '-y', '-ss', String(Math.max(0, atSec)), '-i', file, '-frames:v', '1', '-q:v', '2', out], { timeout: 60_000 });
  }
  const size = jpegSize(await readFile(out));
  if (!size) throw new Error(`could not read the still of ${basename(file)} at ${atSec} s`);
  return { name, ...size };
}
