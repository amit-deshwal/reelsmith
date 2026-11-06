// RS-1241: a copy of the export without its song, for posting with the song picked from Instagram's own music library
// (a copyrighted song baked into the file can get the reel muted or held back; one added in the app is licensed). The
// picture is copied as is (no re-encode), so it matches the export frame for frame. RS-1264: the reel's other sound
// (voiceover, clips' natural sound, effects) comes from a second audio render with the song left out; when that render
// is silent, or none was made, the copy has no audio at all.
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { ffmpegBin } from '../media-binaries.ts';

const run = promisify(execFile);

export const noSoundName = (videoName: string) => `${basename(videoName, extname(videoName))}.no-song.mp4`;

/** Peak level of a file's audio in dBFS (-Infinity when it has none or it is digital silence). */
export async function peakDb(file: string): Promise<number> {
  const { stderr } = await run(ffmpegBin(), ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { timeout: 120_000, maxBuffer: 8 << 20 })
    .catch((error: { stderr?: string }) => ({ stderr: error.stderr ?? '' }));
  const m = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(stderr);
  return !m || m[1] === '-inf' ? -Infinity : Number(m[1]);
}

/** below this the song-free render has nothing worth keeping (rounding noise from a mix of silent clips) */
export const SILENT_PEAK_DB = -60;

export async function noSoundCopy(file: string, audioFile?: string): Promise<{ name: string; bytes: number; kept: 'sound' | 'none' }> {
  const name = noSoundName(file);
  const out = join(dirname(file), name);
  const keep = audioFile !== undefined && await peakDb(audioFile) > SILENT_PEAK_DB;
  const args = keep
    ? ['-i', file, '-i', audioFile!, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest']
    : ['-i', file, '-map', '0:v:0', '-an', '-c:v', 'copy'];
  await run(ffmpegBin(), ['-v', 'error', '-y', ...args, '-movflags', '+faststart', out], { timeout: 120_000 });
  return { name, bytes: (await stat(out)).size, kept: keep ? 'sound' : 'none' };
}
