// RS-1266: the server half of the QA report on an export. The file's SHA-256 (a review counts only for the file it
// looked at) and a click scan at each audio seam: the sharpest second difference within ±15 ms of the cut against the
// sound just around it (the same measure as seamClick.verify.ts: a hard cut joining two waveforms mid-cycle measured
// 134-160x the steady tone, the 10 ms edge fade of RS-1265 1.3x). Measured against the neighbourhood, not the whole
// reel, so a drum hit in the song beside the cut raises the bar instead of reading as a click.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { promisify } from 'node:util';
import { ffmpegBin } from '../media-binaries.ts';

const run = promisify(execFile);

export const SCAN_RATE = 48000;
/** a cut this many times sharper than the sound around it clicks */
export const CLICK_RATIO = 3;
/** quieter than this around the cut (dBFS RMS) there is nothing to hear */
const QUIET_DB = -50;
const MAX_SEAMS = 200;

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export interface SeamScan { atSec: number; ratio: number; click: boolean }

/** The click measure at each seam of mono samples. */
export function scanSeams(x: Float32Array, sr: number, seams: readonly number[]): SeamScan[] {
  const d2 = (t0: number, t1: number) => {
    let m = 0;
    for (let i = Math.max(2, Math.round(t0 * sr)); i < Math.min(x.length, Math.round(t1 * sr)); i++) m = Math.max(m, Math.abs(x[i]! - 2 * x[i - 1]! + x[i - 2]!));
    return m;
  };
  const rmsDb = (t0: number, t1: number) => {
    let s = 0, n = 0;
    for (let i = Math.max(0, Math.round(t0 * sr)); i < Math.min(x.length, Math.round(t1 * sr)); i++) { s += x[i]! ** 2; n++; }
    return 20 * Math.log10(Math.max(Math.sqrt(s / Math.max(1, n)), 1e-9));
  };
  const end = x.length / sr;
  return seams.filter((t) => t > 0.05 && t < end - 0.05).slice(0, MAX_SEAMS).map((t) => {
    const at = d2(t - 0.015, t + 0.015);
    const around = Math.max(d2(t - 0.25, t - 0.03), d2(t + 0.03, t + 0.25), 1e-6);
    const ratio = at / around;
    const audible = rmsDb(t - 0.05, t + 0.05) > QUIET_DB;
    return { atSec: Number(t.toFixed(3)), ratio: Number(ratio.toFixed(1)), click: audible && ratio > CLICK_RATIO };
  });
}

export async function qaScan(file: string, seams: readonly number[]): Promise<{ sha256: string; seams: SeamScan[] }> {
  const [sha256, pcm] = await Promise.all([
    sha256File(file),
    seams.length
      ? run(ffmpegBin(), ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SCAN_RATE), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 1 << 30, timeout: 120_000 })
        .then((r) => r.stdout as Buffer).catch(() => Buffer.alloc(0))
      : Promise.resolve(Buffer.alloc(0)),
  ]);
  const n = Math.floor(pcm.byteLength / 4);
  const x = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + n * 4));
  return { sha256, seams: x.length ? scanSeams(x, SCAN_RATE, seams) : [] };
}
