// HEIC/HEIF photos (the iPhone default) cannot be drawn by Chromium, so an export with one failed with
// "Error loading image". Before rendering, each such upload is converted to a JPEG next to the staged media and the
// export snapshot points at it; the JPEG is removed with the other staged files.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HEIC = /\.(?:heic|heif)$/i;

export async function heicToJpeg(input: string, output: string): Promise<void> {
  try {
    await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', input, '--out', output]);
  } catch {
    await run('ffmpeg', ['-v', 'error', '-y', '-i', input, '-frames:v', '1', '-q:v', '2', output]);
  }
}

/** Convert every /media/uploads/*.heic reference; returns source -> new public path, and the files to clean up. */
export async function convertHeicReferences(
  sources: readonly string[],
  uploadDirectory: string,
  localFile: (name: string) => Promise<string | null>,
): Promise<{ replacements: Map<string, string>; localPaths: string[] }> {
  const replacements = new Map<string, string>();
  const localPaths: string[] = [];
  for (const source of new Set(sources)) {
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(source, 'http://local').pathname); } catch { continue; }
    if (!pathname.startsWith('/media/uploads/') || !HEIC.test(pathname)) continue;
    const file = await localFile(pathname.slice('/media/uploads/'.length));
    if (!file) continue;
    const name = `${pathname.slice('/media/uploads/'.length).replace(HEIC, '')}.export-${randomUUID().slice(0, 8)}.jpg`;
    const out = resolve(uploadDirectory, name);
    await heicToJpeg(file, out);
    localPaths.push(out);
    replacements.set(source, `/media/uploads/${name}`);
  }
  return { replacements, localPaths };
}
