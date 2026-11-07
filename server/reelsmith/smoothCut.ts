// RS-1259 follow-up: a smooth cut (DaVinci's Smooth Cut). Cutting ums and retakes out of a talking clip leaves jumps
// where the head moves from one place to the next between two frames. Over each jump a few frames that morph from the
// last frame before it to the first one after (Apple's frame-rate conversion between two frames, the retime helper's
// --pair mode) are rendered into a short silent file; the editor lays it over the cut on a track above, so the sound,
// the pieces and their captions stay as they are.
import { mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegBin } from '../media-binaries.ts';
import { HDR_TO_SDR_FILTERS, probeVideo } from '../media-normalization.ts';
import { retimeHelper } from './retimeHelper.ts';
import { pipeline, smoothJobSlot, type SmoothResult } from './smoothSlow.ts';

const runFile = promisify(execFile);

/** Longest jump (seconds of source) a smooth cut bridges; past it the two frames are too far apart to morph. */
export const MAX_CUT_JUMP_SEC = 3;

/** File name of one smooth cut: the two source moments in ms, the frame count and the rate. */
export function smoothCutName(sourceName: string, fromSec: number, toSec: number, frames: number, fps: number): string {
  return `${basename(sourceName, extname(sourceName))}.cut-${Math.round(fromSec * 1000)}-${Math.round(toSec * 1000)}x${frames}f${Math.round(fps * 1000) / 1000}.mp4`;
}

/** The morph's phases: `frames` steps strictly between the two frames, evenly spaced. */
export function cutPhases(frames: number): number[] {
  return Array.from({ length: frames }, (_, k) => Math.round(((k + 1) / (frames + 1)) * 1e4) / 1e4);
}

/**
 * `frames` frames at `fps` that morph from the source frame shown at `fromSec` to the one at `toSec` (the frames just
 * outside the span the cut's overlay covers), with no sound; or why not (`skipped`). Errors throw.
 */
export function smoothCutSpan(file: string, fromSec: number, toSec: number, frames: number, fps: number, outputDir = dirname(file), sourceName = file): Promise<SmoothResult> {
  return smoothJobSlot(async (): Promise<SmoothResult> => {
    if (!(fps > 0) || !(frames >= 1) || !(fromSec >= 0) || !(toSec > fromSec)) throw new Error('a smooth cut needs 0 <= fromSec < toSec, frames >= 1 and fps > 0');
    if (frames > 30) throw new Error('a smooth cut is at most 30 frames');
    if (toSec - fromSec > MAX_CUT_JUMP_SEC) return { skipped: `the jump is over ${MAX_CUT_JUMP_SEC} s; a morph that long smears` };
    const meta = await probeVideo(file);
    const sourceFps = meta.avgFrameRate ?? meta.nominalFrameRate;
    if (!sourceFps) return { skipped: 'the clip has no readable frame rate' };
    const helper = await retimeHelper();
    if ('error' in helper) return { skipped: helper.error.replace('smooth slow motion', 'smooth cuts'), unavailable: true };
    const width = meta.width - (meta.width % 2);
    const height = meta.height - (meta.height % 2);
    const name = smoothCutName(sourceName, fromSec, toSec, frames, fps);
    const out = join(outputDir, name);
    const result = { name, width, height, frames, hasAudio: false };
    if (existsSync(out) && (await stat(out)).mtimeMs >= (await stat(file)).mtimeMs) return { ...result, cached: true };
    // the editor shows source frame floor(t·sourceFps) at time t
    const a = Math.floor(fromSec * sourceFps + 1e-6);
    const b = Math.floor(toSec * sourceFps + 1e-6);
    const filters = [
      ...(meta.hdr ? HDR_TO_SDR_FILTERS : []),
      ...(meta.variableFrameRate ? [`fps=fps=${sourceFps}:round=near`] : []),
      `select='eq(n\\,0)+eq(n\\,${b - a})'`,
      ...(width !== meta.width || height !== meta.height ? [`crop=${width}:${height}:0:0`] : []),
      'format=nv12',
    ];
    const fpsText = String(Math.round(fps * 1000) / 1000);
    const tmp = await mkdtemp(join(tmpdir(), 'rs-cut-'));
    try {
      const phasesFile = join(tmp, 'phases.txt');
      await writeFile(phasesFile, cutPhases(frames).map((p) => p.toFixed(4)).join('\n'));
      const temp = join(tmp, 'cut.mp4');
      await pipeline(
        ['-v', 'error', '-ss', String(Math.max(0, (a - 0.25) / sourceFps)), '-i', file, '-an', '-vf', filters.join(','), '-fps_mode', 'passthrough',
          '-frames:v', '2', '-f', 'rawvideo', '-pix_fmt', 'nv12', 'pipe:1'],
        { bin: helper.bin, args: ['--pair', String(width), String(height), phasesFile] },
        ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'nv12', '-s', `${width}x${height}`, '-r', fpsText, '-i', 'pipe:0',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
          '-r', fpsText, '-fps_mode', 'cfr', '-frames:v', String(frames), '-movflags', '+faststart', temp],
        120_000,
      );
      await rename(temp, out).catch(async () => {
        await runFile(ffmpegBin(), ['-v', 'error', '-y', '-i', temp, '-c', 'copy', '-movflags', '+faststart', out], { timeout: 60_000 });
      });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
    return { ...result, cached: false };
  });
}
