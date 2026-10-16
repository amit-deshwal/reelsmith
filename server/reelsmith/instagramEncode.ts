// RS-301: the safe-encoder path. Turns any rendered video into an Instagram-ready file:
// scale/pad to the preset, CFR, H.264 High, bt709 SDR, AAC 48k stereo, loudness -14 LUFS with a -1 dBTP limiter, faststart.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ReelPreset } from '../../shared/reelsmith/instagramPreset.ts';

const run = promisify(execFile);

export interface LoudnessMeasure { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string }

// Full-range (yuvj420p) sources must be squeezed to limited range, or x264 keeps the full-range tag and the file fails V2.
export function encodeArgs(input: string, output: string, p: ReelPreset, hasAudio: boolean, measured?: LoudnessMeasure, durationSec?: number): string[] {
  const vf = [
    `scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease:flags=lanczos:in_range=auto:out_range=tv`,
    `pad=${p.width}:${p.height}:(ow-iw)/2:(oh-ih)/2:black`,
    `fps=${p.fps}`, 'format=yuv420p', 'setsar=1',
  ].join(',');
  const args = ['-v', 'error', '-y', '-i', input, '-vf', vf,
    '-c:v', 'libx264', '-profile:v', 'high', '-level', p.level, '-preset', 'medium', '-crf', '18',
    '-g', String(p.fps * 2), '-bf', '2', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-color_range', 'tv', '-fps_mode', 'cfr'];
  if (p.lufs === null || !hasAudio) args.push('-an');
  else {
    // two-pass loudness is done by the caller via measureLoudnorm; single-pass here is a safe default
    // Linear second pass hits the target; the 0.5 dB true-peak margin absorbs AAC encoding overshoot.
    const norm = `loudnorm=I=${p.lufs}:TP=${p.truePeakDb - 0.5}:LRA=11` + (measured
      ? `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
      : '');
    // atrim keeps audio no longer than the picture (loudnorm/AAC padding otherwise adds tens of ms, failing V4).
    const trim = durationSec ? `,atrim=0:${durationSec.toFixed(3)}` : '';
    args.push('-af', `${norm},aresample=${p.sampleRate},aformat=channel_layouts=stereo${trim}`,
      '-c:a', 'aac', '-b:a', `${p.audioBitrateK}k`, '-ar', String(p.sampleRate), '-ac', String(p.channels));
  }
  args.push('-movflags', '+faststart', output);
  return args;
}

export async function encodeForInstagram(input: string, output: string, p: ReelPreset): Promise<void> {
  const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', input]);
  const hasAudio = probe.stdout.trim().length > 0;
  let measured: LoudnessMeasure | undefined;
  let durationSec: number | undefined;
  if (hasAudio && p.lufs !== null) {
    const dur = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', input]);
    durationSec = parseFloat(dur.stdout) || undefined;
    const pass1 = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', input, '-vn', '-af', `loudnorm=I=${p.lufs}:TP=${p.truePeakDb - 0.5}:LRA=11:print_format=json`, '-f', 'null', '-'], { maxBuffer: 64 * 1024 * 1024 });
    const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(pass1.stderr)?.[0];
    if (json) measured = JSON.parse(json) as LoudnessMeasure;
  }
  await run('ffmpeg', encodeArgs(input, output, p, hasAudio, measured, durationSec), { maxBuffer: 64 * 1024 * 1024 });
}
