// RS-1259: smooth slow motion (what DaVinci calls Speed Warp). A slowed clip (speed under 1) shows each source frame
// several times: at 0.3x a 30 fps clip gives about 9 new pictures a second, so a velocity edit stutters at its hero
// moment. Like a rewind's reversed copy (reverseClip.ts), the span the clip shows is rendered once into a file in the
// active upload directory, already slowed and at the reel's frame rate, with in-between frames from the retime helper (Apple's
// frame-rate conversion, retimeHelper.ts); the clip then plays that file at speed 1. The sound is slowed the way the
// editor slows it (atempo keeps the pitch), so the copy plays exactly what the slowed clip played, minus the stutter.
// The same pipeline makes motion blur for a sped-up span (motionBlurSpan): each frame is the source frame the editor
// showed, blurred along the motion the helper reads from the frames either side (Apple's VTMotionBlur).
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { ffmpegBin } from '../media-binaries.ts';
import { HDR_TO_SDR_FILTERS, probeVideo } from '../media-normalization.ts';
import { MIN_SMOOTH_RATE, needsSmoothing } from '../../shared/reelsmith/smoothSlow.ts';
import { retimeHelper } from './retimeHelper.ts';

export { MIN_SMOOTH_RATE, needsSmoothing };
const runFile = promisify(execFile);

/** Longest copy (seconds of the reel); a slow-motion moment is a few seconds. */
export const MAX_SMOOTH_SEC = 60;

/**
 * The source position (a frame number of the source, fractional between two frames) of each frame of the copy,
 * counted from the first frame decoded. `phase` is how far into that frame the clip's start falls.
 */
export function smoothPositions(frames: number, rate: number, sourceFps: number, fps: number, phase = 0): number[] {
  const step = (rate * sourceFps) / fps;
  return Array.from({ length: frames }, (_, k) => Math.round((phase + k * step) * 1e4) / 1e4);
}

/** ffmpeg's atempo takes 0.5-2 a stage: 0.3 → atempo=0.5,atempo=0.6; 2.8 → atempo=2,atempo=1.4. */
export function atempoChain(rate: number): string {
  const stages: number[] = [];
  let left = rate;
  while (left < 0.5) { stages.push(0.5); left /= 0.5; }
  while (left > 2) { stages.push(2); left /= 2; }
  stages.push(Math.round(left * 1e6) / 1e6);
  return stages.map((s) => `atempo=${s}`).join(',');
}

/** File name of a smoothed span: start in ms, speed in thousandths, length in frames and the reel's rate, so one span is made once. */
export function smoothSlowName(sourceName: string, startSec: number, rate: number, frames: number, fps: number): string {
  return `${basename(sourceName, extname(sourceName))}.slow-${Math.max(0, Math.round(startSec * 1000))}-${Math.round(rate * 1000)}x${frames}f${Math.round(fps * 1000) / 1000}.mp4`;
}

/** File name of a motion-blurred fast span: as smoothSlowName, plus the blur strength. */
export function motionBlurName(sourceName: string, startSec: number, rate: number, frames: number, fps: number, strength: number): string {
  return smoothSlowName(sourceName, startSec, rate, frames, fps).replace('.slow-', '.blur-').replace(/\.mp4$/, `s${strength}.mp4`);
}

export interface Smoothed { name: string; width: number; height: number; frames: number; hasAudio: boolean; cached: boolean }
/** `skipped`: not needed (enough pictures already, or a hold), or `unavailable` on this Mac (then no clip can be smoothed). */
export type SmoothResult = Smoothed | { skipped: string; unavailable?: true };

/** decoder | helper | encoder; rejects with the stderr of whichever failed. */
export function pipeline(decode: string[], helper: { bin: string; args: string[] }, encode: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const procs = [
      { name: 'decode', p: spawn(ffmpegBin(), decode, { stdio: ['ignore', 'pipe', 'pipe'] }) },
      { name: 'retime', p: spawn(helper.bin, helper.args, { stdio: ['pipe', 'pipe', 'pipe'] }) },
      { name: 'encode', p: spawn(ffmpegBin(), encode, { stdio: ['pipe', 'ignore', 'pipe'] }) },
    ];
    const [d, r, e] = procs.map((x) => x.p) as [ReturnType<typeof spawn>, ReturnType<typeof spawn>, ReturnType<typeof spawn>];
    const errs = procs.map(() => '');
    procs.forEach(({ p }, i) => p.stderr?.on('data', (b: Buffer) => { if (errs[i]!.length < 4000) errs[i] += b.toString(); }));
    // a process that dies closes its pipe; the error is reported from its exit code, not from the broken pipe
    r.stdin?.on('error', () => undefined);
    e.stdin?.on('error', () => undefined);
    d.stdout!.pipe(r.stdin!);
    r.stdout!.pipe(e.stdin!);
    const timer = setTimeout(() => procs.forEach(({ p }) => p.kill('SIGKILL')), timeoutMs);
    let left = procs.length;
    const codes: Array<number | null> = procs.map(() => null);
    procs.forEach(({ p }, i) => {
      p.on('error', (err) => { errs[i] += String(err.message); });
      p.on('close', (code, signal) => {
        codes[i] = code ?? (signal ? -1 : 0);
        // a stage that failed leaves the one before it blocked on a full pipe: stop the rest instead of waiting out the timeout
        if (codes[i] !== 0) procs.forEach(({ p: other }, k) => { if (k !== i && other.exitCode === null) other.kill('SIGKILL'); });
        if (--left > 0) return;
        clearTimeout(timer);
        const failed = procs.map((x, k) => ({ name: x.name, code: codes[k], err: errs[k]!.trim() })).filter((x) => x.code !== 0);
        if (!failed.length) { resolve(); return; }
        // when one stage dies the ones next to it fail on the broken pipe; the cause is the one that did not
        const cause = failed.find((x) => !/broken pipe|output closed|EPIPE/i.test(x.err)) ?? failed[0]!;
        reject(new Error(`${cause.name} failed${cause.code === -1 ? ' (stopped)' : ''}: ${cause.err.split('\n').slice(-3).join(' ') || `exit ${cause.code}`}`));
      });
    });
  });
}

/**
 * Copies made at once. Apple's frame-rate conversion handles one request at a time per session, but separate sessions
 * run side by side (two at once took 5.9 s where one took 5.1), so a velocity edit's parts are made together.
 */
export const SMOOTH_JOBS = 3;
let running = 0;
const waiting: Array<() => void> = [];
export async function smoothJobSlot<T>(work: () => Promise<T>): Promise<T> {
  // a finished job hands its slot straight to the next one waiting, so a new caller cannot slip in between
  if (running < SMOOTH_JOBS) running += 1;
  else await new Promise<void>((go) => waiting.push(go));
  try { return await work(); } finally { const next = waiting.shift(); if (next) next(); else running -= 1; }
}
/** The same span asked for twice at once (a shot and its cut-out copy) is made once. */
const making = new Map<string, Promise<SmoothResult>>();

/**
 * The span of `file` a clip shows (from `startSec`, `frames` reel frames at `rate`) as a smooth copy at `fps`, or why it
 * is not needed or not possible (`skipped`). Errors (a bad file, a failed encode) throw.
 */
export function smoothSlowSpan(file: string, startSec: number, rate: number, frames: number, fps: number, outputDir = dirname(file), sourceName = file): Promise<SmoothResult> {
  return retimeCopy({ file, startSec, rate, frames, fps, outputDir, sourceName });
}

/**
 * RS-1259 follow-up: the span a sped-up clip shows (`rate` over 1) as a copy at `fps` with motion blur of `strength`
 * (1-100) that follows each moving thing; played at speed 1 it shows the same frames as the clip, blurred.
 */
export function motionBlurSpan(file: string, startSec: number, rate: number, frames: number, fps: number, strength: number, outputDir = dirname(file), sourceName = file): Promise<SmoothResult> {
  return retimeCopy({ file, startSec, rate, frames, fps, outputDir, sourceName, blur: Math.round(strength) });
}

interface CopyJob { file: string; startSec: number; rate: number; frames: number; fps: number; outputDir: string; sourceName: string; blur?: number }

function retimeCopy({ file, startSec, rate, frames, fps, outputDir, sourceName, blur }: CopyJob): Promise<SmoothResult> {
  const name = blur ? motionBlurName(sourceName, startSec, rate, frames, fps, blur) : smoothSlowName(sourceName, startSec, rate, frames, fps);
  const key = join(outputDir, name);
  const known = making.get(key);
  if (known) return known;
  const work = async (): Promise<SmoothResult> => {
    if (!(fps > 0) || !(frames >= 1) || !(startSec >= 0) || !(rate > 0)) throw new Error('a retimed copy needs startSec >= 0, rate > 0, frames >= 1 and fps > 0');
    if (blur !== undefined && !(blur >= 1 && blur <= 100)) throw new Error('motion blur strength is 1-100');
    if (frames / fps > MAX_SMOOTH_SEC) throw new Error(`retime at most ${MAX_SMOOTH_SEC} s at once`);
    const meta = await probeVideo(file);
    const sourceFps = meta.avgFrameRate ?? meta.nominalFrameRate;
    if (!sourceFps) return { skipped: 'the clip has no readable frame rate' };
    if (blur) {
      if (!(rate > 1)) return { skipped: 'motion blur is for a sped-up clip' };
    } else if (!needsSmoothing(rate, sourceFps, fps)) {
      return { skipped: rate < MIN_SMOOTH_RATE ? 'a hold, not slow motion' : `a ${Math.round(sourceFps)} fps clip at ${rate}x already has a new picture on every frame` };
    }
    const helper = await retimeHelper();
    if ('error' in helper) return { skipped: blur ? helper.error.replace('smooth slow motion', 'motion blur') : helper.error, unavailable: true };
    if (blur && !helper.blur) return { skipped: 'motion blur needs macOS 15.4 or later', unavailable: true };
    const width = meta.width - (meta.width % 2);
    const height = meta.height - (meta.height % 2);
    const out = join(outputDir, name);
    const result = { name, width, height, frames, hasAudio: meta.hasAudio };
    // a cached copy is reused only when it is newer than the video it came from
    if (existsSync(out) && (await stat(out)).mtimeMs >= (await stat(file)).mtimeMs) return { ...result, cached: true };
    // the editor shows source frame floor(t·sourceFps) at time t: start decoding at that frame (seeking a quarter frame
    // early, so the seek keeps it and drops the one before), and carry the rest of t into the positions; motion blur
    // also reads the frame before the first one shown
    const shown = Math.floor(startSec * sourceFps + 1e-6);
    const first = blur ? Math.max(0, shown - 1) : shown;
    const positions = smoothPositions(frames, rate, sourceFps, fps, startSec * sourceFps - first);
    const need = Math.floor(positions.at(-1)!) + 2;
    const fpsText = String(Math.round(fps * 1000) / 1000);
    const filters = [
      ...(meta.hdr ? HDR_TO_SDR_FILTERS : []),
      // a variable-rate phone clip is put on its own steady grid first, so frame n is n / sourceFps in
      ...(meta.variableFrameRate ? [`fps=fps=${sourceFps}:round=near`] : []),
      ...(width !== meta.width || height !== meta.height ? [`crop=${width}:${height}:0:0`] : []),
      'format=nv12',
    ];
    const tmp = await mkdtemp(join(tmpdir(), 'rs-smooth-'));
    try {
      const positionsFile = join(tmp, 'positions.txt');
      await writeFile(positionsFile, positions.map((p) => p.toFixed(4)).join('\n'));
      const temp = join(tmp, 'smooth.mp4');
      const sound = meta.hasAudio ? ['-ss', String(startSec), '-t', String((frames * rate) / fps), '-i', file] : [];
      await pipeline(
        ['-v', 'error', '-ss', String(Math.max(0, (first - 0.25) / sourceFps)), '-i', file, '-an', '-frames:v', String(need),
          '-vf', filters.join(','), '-f', 'rawvideo', '-pix_fmt', 'nv12', 'pipe:1'],
        { bin: helper.bin, args: [...(blur ? ['--blur', String(blur)] : []), String(width), String(height), positionsFile] },
        ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'nv12', '-s', `${width}x${height}`, '-r', fpsText, '-i', 'pipe:0', ...sound,
          '-map', '0:v:0', ...(meta.hasAudio ? ['-map', '1:a:0?', '-af', `${atempoChain(rate)},apad`, '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
          '-r', fpsText, '-fps_mode', 'cfr', '-frames:v', String(frames), '-movflags', '+faststart', temp],
        600_000,
      );
      await rename(temp, out).catch(async () => {
        // the uploads folder can be on another volume than the temp folder
        await runFile(ffmpegBin(), ['-v', 'error', '-y', '-i', temp, '-c', 'copy', '-movflags', '+faststart', out], { timeout: 120_000 });
      });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
    return { ...result, cached: false };
  };
  const job = smoothJobSlot(work).finally(() => making.delete(key));
  making.set(key, job);
  return job;
}
