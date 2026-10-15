// RS-301/RS-302: after an export renders, check it against the Instagram rules (V1-V7, V9). If it fails,
// re-encode once with the safe ffmpeg encoder and check again. A good result replaces the rendered file
// (so delivery copies the fixed one); a still-bad result is kept beside it as <name>.failed.mp4.
import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import type { ReelPreset } from '../../shared/reelsmith/instagramPreset.ts';
import { validateReel, type ValidationReport } from './exportValidate.ts';
import { encodeForInstagram } from './instagramEncode.ts';

export interface FinalizeResult {
  ok: boolean;
  /** true when the safe encoder rewrote the file */
  reencoded: boolean;
  first: ValidationReport;
  second?: ValidationReport;
  /** where the failed re-encode was kept */
  failedPath?: string;
}

export async function finalizeForInstagram(
  file: string, preset: ReelPreset,
  deps: { validate?: typeof validateReel; encode?: typeof encodeForInstagram } = {},
): Promise<FinalizeResult> {
  const validate = deps.validate ?? validateReel;
  const encode = deps.encode ?? encodeForInstagram;
  const first = await validate(file, { preset });
  if (first.ok) return { ok: true, reencoded: false, first };
  const tmp = file.replace(/(\.[a-z0-9]+)?$/i, '.instagram-tmp.mp4');
  try {
    await encode(file, tmp, preset);
  } catch (error) {
    if (existsSync(tmp)) await rm(tmp, { force: true });
    throw error;
  }
  const second = await validate(tmp, { preset });
  if (second.ok) {
    await rename(tmp, file);
    return { ok: true, reencoded: true, first, second };
  }
  const failedPath = file.replace(/(\.[a-z0-9]+)?$/i, '.failed.mp4');
  await rename(tmp, failedPath);
  return { ok: false, reencoded: true, first, second, failedPath };
}
