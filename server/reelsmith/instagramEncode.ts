// RS-301: the safe-encoder path. Turns any rendered video into an Instagram-ready file:
// scale/pad to the preset, CFR, H.264 High, bt709 SDR, AAC 48k stereo, loudness -14 LUFS with a -1 dBTP limiter, faststart.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ReelPreset } from '../../shared/reelsmith/instagramPreset.ts';

const run = promisify(execFile);

export interface LoudnessMeasure { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string }

// Full-range (yuvj420p) sources must be squeezed to limited range, or x264 keeps the full-range tag and the file fails V2.
/** AAC adds up to ~1 dB of inter-sample overshoot after loudnorm, so aim the limiter this far below the -1 dBTP ceiling. */
const TP_MARGIN = 1.5;

/** Static gain to the target, then a 4x-oversampled lookahead limiter (an approximation of a true-peak limiter). */
export interface LimitedGain { gainDb: number; ceilingDb: number }

/** RS-603: loudnorm's linear mode will not raise the level past the true-peak ceiling, so a peaky mix (speech) stayed several
 * dB under -14 LUFS. Those files get gain plus a limiter instead. */
export function needsLimiter(m: LoudnessMeasure, p: ReelPreset, tpMargin = TP_MARGIN): boolean {
  const i = Number(m.input_i), tp = Number(m.input_tp);
  if (p.lufs === null || !Number.isFinite(i) || !Number.isFinite(tp)) return false;
  return tp + (p.lufs - i) > p.truePeakDb - tpMargin;
}

export function limiterFilter(l: LimitedGain, sampleRate: number): string {
  const limit = Math.min(1, Math.max(0.0625, 10 ** (l.ceilingDb / 20)));
  return `volume=${l.gainDb.toFixed(2)}dB,aresample=${sampleRate * 4},alimiter=limit=${limit.toFixed(4)}:attack=5:release=80:level=false:latency=true,aresample=${sampleRate}`;
}

export function encodeArgs(input: string, output: string, p: ReelPreset, hasAudio: boolean, measured?: LoudnessMeasure, durationSec?: number, tpMargin = TP_MARGIN, limited?: LimitedGain): string[] {
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
    // A silent track measures -inf LUFS, which loudnorm rejects; there is nothing to normalise, so just resample it.
    const silent = measured !== undefined && !Number.isFinite(Number(measured.input_i));
    const norm = silent ? 'anull' : limited ? limiterFilter(limited, p.sampleRate) : `loudnorm=I=${p.lufs}:TP=${p.truePeakDb - tpMargin}:LRA=11` + (measured
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
  }
  let margin = TP_MARGIN;
  let limited: LimitedGain | undefined;
  for (let attempt = 0; ; attempt += 1) {
    if (hasAudio && p.lufs !== null && !limited) {
      const pass1 = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', input, '-vn', '-af', `loudnorm=I=${p.lufs}:TP=${p.truePeakDb - margin}:LRA=11:print_format=json`, '-f', 'null', '-'], { maxBuffer: 64 * 1024 * 1024 });
      const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(pass1.stderr)?.[0];
      measured = json ? JSON.parse(json) as LoudnessMeasure : undefined;
      if (measured && needsLimiter(measured, p, margin)) limited = { gainDb: p.lufs - Number(measured.input_i), ceilingDb: p.truePeakDb - margin };
    }
    await run('ffmpeg', encodeArgs(input, output, p, hasAudio, measured, durationSec, margin, limited), { maxBuffer: 64 * 1024 * 1024 });
    if (!hasAudio || p.lufs === null || attempt >= 3) return;
    const m = await loudnessOf(output);
    if (!m) return;
    // AAC overshoots the limiter by up to ~1 dB, and by how much depends on the music; measure and retry with more headroom.
    const overPeak = m.truePeak > p.truePeakDb + 0.05;
    // limiting takes some loudness away; add it back (the limiter keeps the peaks in check)
    const offTarget = limited !== undefined && Math.abs(m.integrated - p.lufs) > 0.5;
    if (!overPeak && !offTarget) return;
    if (overPeak) margin += m.truePeak - p.truePeakDb + 0.3;
    if (limited) limited = { gainDb: limited.gainDb + (offTarget ? p.lufs - m.integrated : 0), ceilingDb: p.truePeakDb - margin };
  }
}

async function loudnessOf(file: string): Promise<{ integrated: number; truePeak: number } | null> {
  const r = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { maxBuffer: 64 * 1024 * 1024 });
  const sum = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const integrated = Number(/I:\s+(-?[\d.]+) LUFS/.exec(sum)?.[1]);
  const truePeak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(sum)?.[1]);
  return Number.isFinite(integrated) && Number.isFinite(truePeak) ? { integrated, truePeak } : null;
}
