// RS-301/RS-302: after an export renders, check it against the Instagram rules (V1-V7, V9, V10). If it fails,
// re-encode once with the safe ffmpeg encoder and check again. A good result replaces the rendered file
// (so delivery copies the fixed one); a still-bad result is kept beside it as <name>.failed.mp4.
import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import type { ReelPreset } from '../../shared/reelsmith/instagramPreset.ts';
import { validateReel, type ValidationReport } from './exportValidate.ts';
import { encodeForInstagram } from './instagramEncode.ts';

/** checks about the sound alone; a failure confined to these can be fixed without touching the picture */
const AUDIO_CHECKS = new Set(['V3', 'V4', 'V6']);

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
  /** RS-1231: still stretches someone placed (freeze frames, photos), in seconds; V10 does not flag them */
  intendedHolds: Array<[number, number]> = [],
): Promise<FinalizeResult> {
  const check = deps.validate ?? validateReel;
  const validate = (f: string, o: { preset: ReelPreset }) => check(f, { ...o, intendedHolds });
  const encode = deps.encode ?? encodeForInstagram;
  const first = await validate(file, { preset });
  if (first.ok) return { ok: true, reencoded: false, first };
  const tmp = file.replace(/(\.[a-z0-9]+)?$/i, '.instagram-tmp.mp4');
  // Picture passes and only sound (levels, length match) fails: keep the video as rendered and rewrite just the audio.
  const failed = first.checks.filter((c) => c.status === 'FAIL');
  const audioOnly = failed.length > 0 && failed.every((c) => AUDIO_CHECKS.has(c.id));
  let second: ValidationReport | undefined;
  try {
    if (audioOnly) {
      await encode(file, tmp, preset, { copyVideo: true });
      second = await validate(tmp, { preset });
      if (second.ok) { await rename(tmp, file); return { ok: true, reencoded: true, first, second }; }
    }
    await encode(file, tmp, preset);
  } catch (error) {
    if (existsSync(tmp)) await rm(tmp, { force: true });
    throw error;
  }
  second = await validate(tmp, { preset });
  if (second.ok) {
    await rename(tmp, file);
    return { ok: true, reencoded: true, first, second };
  }
  const failedPath = file.replace(/(\.[a-z0-9]+)?$/i, '.failed.mp4');
  await rename(tmp, failedPath);
  return { ok: false, reencoded: true, first, second, failedPath };
}
