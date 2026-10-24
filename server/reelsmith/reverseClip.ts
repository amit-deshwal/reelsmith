// A reversed copy of one span of a video (Reverse clip, RS-1223), saved next to it in the uploads folder. The editor plays
// sources forwards only, so a rewind is a real file: the clip's source span, picture and sound both played backwards.
// ffmpeg's reverse filter holds every frame it reverses in memory, so the picture is reversed one second at a time and
// the seconds are joined last to first; a long 4K clip then holds about a second of frames, not the whole span.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { ffmpegBin } from '../media-binaries.ts';
import { HDR_TO_SDR_FILTERS, probeVideo } from '../media-normalization.ts';

const run = promisify(execFile);

/** Longest span that can be reversed (seconds); a rewind in a reel is a few seconds. */
export const MAX_REVERSE_SEC = 120;

export interface Reversed { name: string; width: number; height: number; frames: number; hasAudio: boolean; cached: boolean }

/** File name of the reversed span: start in milliseconds and length in frames at `fps`, so one span is made once. */
export function reverseName(sourceName: string, startSec: number, frames: number, fps: number): string {
  return `${basename(sourceName, extname(sourceName))}.rev-${Math.max(0, Math.round(startSec * 1000))}-${frames}f${Math.round(fps * 1000) / 1000}.mp4`;
}

/** The chunks of a span of `frames`, as [first frame, frame count], each at most `size` long. */
export function reverseChunks(frames: number, size: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let at = 0; at < frames; at += size) out.push([at, Math.min(size, frames - at)]);
  return out;
}

/** One reversal at a time: each holds a second of decoded frames and an encoder. */
let queue: Promise<unknown> = Promise.resolve();

export function reverseSpan(file: string, startSec: number, frames: number, fps: number): Promise<Reversed> {
  const work = async (): Promise<Reversed> => {
    if (!(fps > 0) || !(frames >= 1) || !(startSec >= 0)) throw new Error('reverse needs startSec >= 0, frames >= 1 and fps > 0');
    if (frames / fps > MAX_REVERSE_SEC) throw new Error(`reverse at most ${MAX_REVERSE_SEC} s of a clip at once`);
    const meta = await probeVideo(file);
    const name = reverseName(file, startSec, frames, fps);
    const out = join(dirname(file), name);
    const result = { name, width: meta.width, height: meta.height, frames, hasAudio: meta.hasAudio };
    // a cached copy is reused only when it is newer than the video it came from
    if (existsSync(out) && (await stat(out)).mtimeMs >= (await stat(file)).mtimeMs) return { ...result, cached: true };
    const rate = String(Math.round(fps * 1000) / 1000);
    const tmp = await mkdtemp(join(tmpdir(), 'rs-reverse-'));
    try {
      // each second, reversed into a lossless temporary file (ffmpeg applies the phone's rotation by itself)
      const chunks = reverseChunks(frames, Math.max(1, Math.round(fps)));
      const parts: string[] = [];
      for (const [at, count] of chunks) {
        const part = join(tmp, `part-${at}.mkv`);
        const filters = [...(meta.hdr ? HDR_TO_SDR_FILTERS : []), `fps=fps=${rate}:round=near`,
          // trim before reversing: reverse reads to the end of its input before it outputs anything
          `trim=end_frame=${count}`, 'reverse', 'format=yuv420p'];
        await run(ffmpegBin(), [
          '-v', 'error', '-y', '-ss', String(startSec + at / fps), '-i', file, '-an', '-frames:v', String(count),
          '-vf', filters.join(','), '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', part,
        ], { timeout: 120_000 });
        parts.push(part);
      }
      // last second first (read one part at a time), plus the span's sound played backwards, in one encode
      const list = join(tmp, 'parts.txt');
      await writeFile(list, parts.reverse().map((p) => `file '${p}'`).join('\n'));
      const sound = meta.hasAudio ? ['-ss', String(startSec), '-t', String(frames / fps), '-i', file] : [];
      const temp = join(tmp, 'reversed.mp4');
      await run(ffmpegBin(), [
        '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, ...sound,
        '-map', '0:v:0', ...(meta.hasAudio ? ['-map', '1:a:0', '-af', 'areverse', '-c:a', 'aac', '-b:a', '192k'] : []),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-r', rate, '-fps_mode', 'cfr', '-frames:v', String(frames), '-movflags', '+faststart', temp,
      ], { timeout: 600_000 });
      await rename(temp, out).catch(async () => {
        // the uploads folder can be on another volume than the temp folder
        await run(ffmpegBin(), ['-v', 'error', '-y', '-i', temp, '-c', 'copy', '-movflags', '+faststart', out], { timeout: 120_000 });
      });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
    return { ...result, cached: false };
  };
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}
