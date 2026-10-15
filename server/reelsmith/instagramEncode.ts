// RS-301: the safe-encoder path. Turns any rendered video into an Instagram-ready file:
// scale/pad to the preset, CFR, H.264 High, bt709 SDR, AAC 48k stereo, loudness -14 LUFS with a -1 dBTP limiter, faststart.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ReelPreset } from '../../shared/reelsmith/instagramPreset.ts';

const run = promisify(execFile);

export function encodeArgs(input: string, output: string, p: ReelPreset, hasAudio: boolean): string[] {
  const vf = [
    `scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${p.width}:${p.height}:(ow-iw)/2:(oh-ih)/2:black`,
    `fps=${p.fps}`, 'format=yuv420p', 'setsar=1',
  ].join(',');
  const args = ['-v', 'error', '-y', '-i', input, '-vf', vf,
    '-c:v', 'libx264', '-profile:v', 'high', '-level', p.level, '-preset', 'medium', '-crf', '18',
    '-g', String(p.fps * 2), '-bf', '2', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-fps_mode', 'cfr'];
  if (p.lufs === null || !hasAudio) args.push('-an');
  else {
    // two-pass loudness is done by the caller via measureLoudnorm; single-pass here is a safe default
    args.push('-af', `loudnorm=I=${p.lufs}:TP=${p.truePeakDb}:LRA=11,aresample=${p.sampleRate},aformat=channel_layouts=stereo`,
      '-c:a', 'aac', '-b:a', `${p.audioBitrateK}k`, '-ar', String(p.sampleRate), '-ac', String(p.channels));
  }
  args.push('-movflags', '+faststart', output);
  return args;
}

export async function encodeForInstagram(input: string, output: string, p: ReelPreset): Promise<void> {
  const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', input]);
  await run('ffmpeg', encodeArgs(input, output, p, probe.stdout.trim().length > 0), { maxBuffer: 64 * 1024 * 1024 });
}
