// RS-302 V8: preview-vs-export parity sample (spec §12.6a / §12.7).
// Frames rendered by the editor's own still renderer (the same composition the export uses) are compared with the
// same frames decoded from the exported file. The score is ffmpeg's SSIM on a small common size.
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ffmpegBin } from '../media-binaries.ts';
import type { Check } from './exportValidate.ts';

const run = promisify(execFile);

export const PARITY_PASS_SSIM = 0.9;
export const PARITY_SAMPLE_COUNT = 5;
/** Both images are scaled to this before comparing (a 9:16 thumbnail is plenty to see a wrong layout). */
const CMP_W = 270;
const CMP_H = 480;

/** `count` frame numbers spread over [0, totalFrames), avoiding the very first and last frame (fades, flashes). */
export function sampleFrames(totalFrames: number, count = PARITY_SAMPLE_COUNT): number[] {
  if (!(totalFrames > 0)) return [];
  const n = Math.min(count, totalFrames);
  const out = new Set<number>();
  for (let i = 0; i < n; i += 1) {
    const f = Math.round(((i + 0.5) / n) * totalFrames);
    out.add(Math.max(0, Math.min(totalFrames - 1, f)));
  }
  return [...out].sort((a, b) => a - b);
}

/** Pull "All:0.9876" out of ffmpeg's ssim summary line. */
export function parseSsim(stderr: string): number | null {
  const m = /SSIM[^\n]*\bAll:([0-9.]+)/.exec(stderr);
  return m ? Number(m[1]) : null;
}

export interface ParityScore { frame: number; ssim: number | null }

export function summariseParity(scores: ParityScore[]): Check {
  const valid = scores.filter((s): s is { frame: number; ssim: number } => s.ssim !== null && Number.isFinite(s.ssim));
  if (!valid.length) return { id: 'V8', status: 'WARN', detail: 'could not compare any frames' };
  const worst = valid.reduce((a, b) => (b.ssim < a.ssim ? b : a));
  const mean = valid.reduce((s, v) => s + v.ssim, 0) / valid.length;
  const detail = `${valid.length} frames, mean SSIM ${mean.toFixed(3)}, lowest ${worst.ssim.toFixed(3)} at frame ${worst.frame}`;
  return worst.ssim >= PARITY_PASS_SSIM
    ? { id: 'V8', status: 'PASS', detail }
    : { id: 'V8', status: 'WARN', detail: `${detail}; export differs from the preview there` };
}

async function ssimOf(exportFrame: string, still: string): Promise<number | null> {
  const scale = `scale=${CMP_W}:${CMP_H}:force_original_aspect_ratio=decrease,pad=${CMP_W}:${CMP_H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
  try {
    const { stderr } = await run(ffmpegBin(), ['-hide_banner', '-nostats', '-i', exportFrame, '-i', still,
      '-lavfi', `[0:v]${scale}[a];[1:v]${scale}[b];[a][b]ssim`, '-f', 'null', '-'], { maxBuffer: 16 * 1024 * 1024 });
    return parseSsim(stderr);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    return parseSsim(stderr);
  }
}

export interface ParityInput {
  /** the exported video file */
  file: string;
  fps: number;
  /** frame numbers (timeline frames; export frame 0 = timeline frame `firstFrame`) */
  frames: number[];
  /** same frames rendered by the editor's still renderer (JPEG, base64) */
  stills: Array<{ frame: number; base64: string }>;
  /** timeline frame at which the export starts (default 0) */
  firstFrame?: number;
}

export async function checkParity(input: ParityInput): Promise<Check> {
  const dir = await mkdtemp(join(tmpdir(), 'rs-parity-'));
  try {
    const scores: ParityScore[] = [];
    for (const still of input.stills) {
      const stillFile = join(dir, `still-${still.frame}.jpg`);
      const frameFile = join(dir, `export-${still.frame}.png`);
      await writeFile(stillFile, Buffer.from(still.base64, 'base64'));
      const t = (still.frame - (input.firstFrame ?? 0)) / input.fps;
      try {
        await run(ffmpegBin(), ['-v', 'error', '-y', '-ss', t.toFixed(4), '-i', input.file, '-frames:v', '1', frameFile]);
        scores.push({ frame: still.frame, ssim: await ssimOf(frameFile, stillFile) });
      } catch {
        scores.push({ frame: still.frame, ssim: null });
      }
    }
    return summariseParity(scores);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
