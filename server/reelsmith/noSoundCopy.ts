// RS-1241: a copy of the export with no sound, for posting with a song picked from Instagram's own music library (a
// copyrighted song baked into the file can get the reel muted or held back; one added in the app is licensed). The
// picture is copied as is (no re-encode), so it matches the export frame for frame.
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { ffmpegBin } from '../media-binaries.ts';

const run = promisify(execFile);

export const noSoundName = (videoName: string) => `${basename(videoName, extname(videoName))}.no-sound.mp4`;

export async function noSoundCopy(file: string): Promise<{ name: string; bytes: number }> {
  const name = noSoundName(file);
  const out = join(dirname(file), name);
  await run(ffmpegBin(), ['-v', 'error', '-y', '-i', file, '-map', '0:v:0', '-an', '-c:v', 'copy', '-movflags', '+faststart', out], { timeout: 120_000 });
  return { name, bytes: (await stat(out)).size };
}
