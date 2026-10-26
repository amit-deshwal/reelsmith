// RS-304: Remotion's MP4 keeps the AAC encoder's two priming frames (2048 samples, 42.7 ms at 48 kHz) in the audio track
// with no edit list, so players start the audio that much late relative to the video. This remuxes (stream copy, no
// re-encode) with an edit list that skips the priming, which puts a beep exactly on its flash frame again.
// Remotion 4.0.531 and later shift the AAC input by the same 2048 samples themselves (`-itsoffset`, its aac-priming.ts),
// so their files are left alone; fixing them again put the audio 43 ms early.
import { execFile } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const PRIMING_SAMPLES = 2048;
const MARKER = 'reelsmith:aac-priming-skipped';
const FIRST_SELF_FIXING_REMOTION = [4, 0, 531];

interface Probe { streams?: Array<{ codec_type?: string; codec_name?: string; sample_rate?: string }>; format?: { tags?: Record<string, string> } }

/** True for a Remotion "Made with Remotion x.y.z" comment whose renderer still leaves the priming in. */
export function remotionLeavesPriming(comment: string): boolean {
  const m = /Remotion (\d+)\.(\d+)\.(\d+)/i.exec(comment);
  if (!m) return /Remotion/i.test(comment);
  const v = m.slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (v[i] !== FIRST_SELF_FIXING_REMOTION[i]) return v[i]! < FIRST_SELF_FIXING_REMOTION[i]!;
  return false;
}

export async function needsPrimingFix(file: string): Promise<number | null> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,sample_rate:format_tags=comment', '-of', 'json', file]);
  const info = JSON.parse(stdout) as Probe;
  const comment = info.format?.tags?.comment ?? info.format?.tags?.COMMENT ?? '';
  if (!remotionLeavesPriming(comment) || comment.includes(MARKER)) return null;
  const audio = info.streams?.find((s) => s.codec_type === 'audio');
  const rate = Number(audio?.sample_rate);
  if (audio?.codec_name !== 'aac' || !Number.isFinite(rate) || rate <= 0) return null;
  return PRIMING_SAMPLES / rate;
}

/** Returns true when the file was changed. Leaves the file alone (and returns false) on anything unexpected. */
export async function skipAacPriming(file: string): Promise<boolean> {
  const seconds = await needsPrimingFix(file).catch(() => null);
  if (seconds === null) return false;
  const tmp = file.replace(/(\.[a-z0-9]+)?$/i, '.priming-tmp.mp4');
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=comment', '-of', 'csv=p=0', file]);
    await run('ffmpeg', [
      '-v', 'error', '-y', '-i', file, '-ss', seconds.toFixed(7), '-i', file,
      '-map', '0:v', '-map', '1:a', '-c', 'copy', '-map_metadata', '0',
      '-metadata', `comment=${stdout.trim()} ${MARKER}`, '-movflags', '+faststart', tmp,
    ], { maxBuffer: 1 << 24 });
    await rename(tmp, file);
    return true;
  } catch {
    await rm(tmp, { force: true });
    return false;
  }
}
