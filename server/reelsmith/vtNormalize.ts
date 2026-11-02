// RS-1248: import conversion on the Mac's media engine. iPhone clips are 4K HEVC, HDR (HLG) and rotation-coded; the CPU
// path (zscale tone map, lanczos scale) converts them at about 2.5x real time whatever the concurrency, so 25 Torna clips
// (188 s of footage) took close to four minutes with transcription running alongside. Decoding into VideoToolbox frames,
// scaling and tone mapping with scale_vt and rotating with transpose_vt keeps the frames on the GPU: 3.5 s instead of
// 7.8 s for a 14.7 s 4K60 HLG clip. It needs an ffmpeg with both filters (7.1+); the bundled one is 6.0, so a Homebrew
// ffmpeg is used when present. Any failure falls back to the CPU path.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { h264EncodingArgs, type probeEncoderQualityMode, type resolveH264Encoder } from '../media-acceleration.ts';
import { throwIfNormalizationAborted } from '../media-normalization-admission.ts';

const CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
let cached: Promise<string | null> | null = null;

function filtersOf(ffmpeg: string): Promise<string> {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(ffmpeg, ['-hide_banner', '-filters'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
    child.stdout.on('data', (c: Buffer) => { out += c.toString(); });
    child.once('error', () => { clearTimeout(timer); resolve(''); });
    child.once('close', () => { clearTimeout(timer); resolve(out); });
  });
}

/** An ffmpeg with scale_vt and transpose_vt (the bundled one first), or null off macOS or when disabled. */
export function vtFfmpeg(bundled: string, platform: NodeJS.Platform = process.platform): Promise<string | null> {
  if (platform !== 'darwin' || process.env.REELSMITH_VT_NORMALIZE === '0') return Promise.resolve(null);
  cached ??= (async () => {
    for (const bin of [bundled, process.env.REELSMITH_VT_FFMPEG, ...CANDIDATES]) {
      if (!bin || (bin.includes('/') && !existsSync(bin))) continue;
      const filters = await filtersOf(bin);
      if (/\bscale_vt\b/.test(filters) && /\btranspose_vt\b/.test(filters)) return bin;
    }
    return null;
  })();
  return cached;
}

/**
 * How far the picture turns clockwise to display, 0-359. ffprobe 4.x (the bundled one) reports an iPhone portrait clip
 * as `tags.rotate: "90"` (clockwise) and its display matrix as `rotation: -90` (counter-clockwise); `rotationOf` reads
 * either the same way, which is enough to swap width and height but not to turn the picture: the first batch came out
 * upside down.
 */
export function clockwiseRotation(video: Record<string, unknown>): number {
  const norm = (d: number) => ((Math.round(d) % 360) + 360) % 360;
  const tag = Number((video.tags as Record<string, unknown> | undefined)?.rotate);
  if (Number.isFinite(tag) && tag !== 0) return norm(tag);
  const sides = [video.rotation, ...((video.side_data_list as Array<Record<string, unknown>> | undefined) ?? []).map((e) => e.rotation)];
  for (const side of sides) {
    const ccw = Number(side);
    if (Number.isFinite(ccw) && ccw !== 0) return norm(-ccw);
  }
  return 0;
}

/** transpose_vt direction for a clockwise display rotation (0-359); undefined for none, null when it cannot. */
export function vtTransposeDir(rotation: number): string | null | undefined {
  if (rotation === 0) return undefined;
  if (rotation === 90) return 'clock';
  if (rotation === 270) return 'cclock';
  if (rotation === 180) return 'reversal';
  return null;
}

export interface VtTranscodeOptions {
  inputPath: string;
  hasAudio: boolean;
  /** the source's clockwise display rotation, 0-359 (`clockwiseRotation`) */
  rotation: number;
  /** displayed output size */
  targetW: number;
  targetH: number;
  targetFps: number;
  convertToCfr: boolean;
  hdr: boolean;
  /** h264_videotoolbox rate-control args (no -pix_fmt: the frames stay on the GPU) */
  encodeArgs: string[];
  audioArgs: string[];
  outputArgs: string[];
}

/** The ffmpeg arguments, or null when the rotation is not one transpose_vt handles. */
export function vtTranscodeArgs(o: VtTranscodeOptions): string[] | null {
  const dir = vtTransposeDir(o.rotation);
  if (dir === null) return null;
  const swapped = o.rotation === 90 || o.rotation === 270;
  // scale in the coded orientation, then rotate to the displayed one
  const [w, h] = swapped ? [o.targetH, o.targetW] : [o.targetW, o.targetH];
  const filters = [`scale_vt=w=${w}:h=${h}${o.hdr ? ':color_matrix=bt709:color_primaries=bt709:color_transfer=bt709' : ''}`];
  if (dir) filters.push(`transpose_vt=dir=${dir}`);
  if (o.convertToCfr) filters.push(`fps=fps=${Math.round(o.targetFps * 1000) / 1000}:start_time=0:round=near`);
  const encode: string[] = [];
  for (let i = 0; i < o.encodeArgs.length; i += 1) {
    if (o.encodeArgs[i] === '-pix_fmt') { i += 1; continue; }
    encode.push(o.encodeArgs[i]!);
  }
  return [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-hwaccel', 'videotoolbox', '-hwaccel_output_format', 'videotoolbox_vld',
    // the picture is rotated by transpose_vt; the output must not carry the rotation again
    '-display_rotation', '0',
    '-i', o.inputPath, '-map', '0:v:0', ...(o.hasAudio ? ['-map', '0:a:0?'] : ['-an']),
    '-vf', filters.join(','),
    // no -colorspace/-color_trc here: they ask for a CPU colour conversion of GPU frames ("Function not implemented");
    // scale_vt already tags the frames bt709
    ...encode, '-profile:v', 'high',
    ...(o.convertToCfr ? ['-fps_mode', 'cfr'] : []),
    ...o.audioArgs, ...o.outputArgs,
  ];
}

export interface VtEncodeRequest {
  ffmpeg: string;
  audioArgs: string[];
  outputArgs: string[];
  options: {
    readonly targetW: number; readonly targetH: number; readonly targetBitrate: number; readonly targetFps: number;
    readonly convertToCfr: boolean; readonly hdr?: boolean; readonly inputPath?: string; readonly hasAudio?: boolean;
    readonly rotation?: number;
  };
  outputPath: string;
  preferred: Awaited<ReturnType<typeof resolveH264Encoder>>;
  proxyQuality: Awaited<ReturnType<typeof probeEncoderQualityMode>>;
  /** the normaliser's ffmpeg runner (timeout, abort, stderr capture) */
  run: (cmd: string, args: string[]) => Promise<unknown>;
  signal?: AbortSignal;
}

/** The whole conversion on the Mac's media engine; false (and no output) when it cannot run. */
export async function encodeOnVideoToolbox(r: VtEncodeRequest): Promise<boolean> {
  const { options } = r;
  if (r.preferred !== 'h264_videotoolbox' || !options.inputPath) return false;
  const vt = await vtFfmpeg(r.ffmpeg);
  if (!vt) return false;
  const args = vtTranscodeArgs({
    inputPath: options.inputPath, hasAudio: options.hasAudio === true, rotation: options.rotation ?? 0,
    targetW: options.targetW, targetH: options.targetH, targetFps: options.targetFps, convertToCfr: options.convertToCfr,
    hdr: options.hdr === true, audioArgs: r.audioArgs, outputArgs: r.outputArgs,
    encodeArgs: h264EncodingArgs({
      encoder: r.preferred, targetBitrate: options.targetBitrate, maxBitrate: options.targetBitrate, bufferSize: options.targetBitrate * 2,
      ...(r.proxyQuality ? { hardwareQuality: 23, qualityMode: r.proxyQuality } : {}),
    }),
  });
  if (!args) return false;
  try {
    await r.run(vt, args);
    return true;
  } catch (error) {
    throwIfNormalizationAborted(r.signal);
    console.warn(`[normalize-media] VideoToolbox path failed (${error instanceof Error ? error.message.slice(0, 200) : String(error)}); using the CPU path`);
    await unlink(r.outputPath).catch(() => {});
    return false;
  }
}
