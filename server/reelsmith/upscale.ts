// Optional 2x enhancement for small photos: Real-ESRGAN x2plus run by server/reelsmith/upscale.py in a local virtualenv
// (.reelsmith-venv, Apple GPU when available). Never touches the original: the result is written next to it as `<name>.x2.jpg`
// and reused while it is newer than the source. Nothing leaves the machine. Absent venv or weights = feature unavailable.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PYTHON = join(process.cwd(), '.reelsmith-venv', 'bin', 'python');
const SCRIPT = join(HERE, 'upscale.py');
const WEIGHTS = join(HERE, 'upscale-models', 'RealESRGAN_x2plus.pth');
const MAX_SOURCE_PX = 3000; // longest side; bigger photos are already sharp enough and would be slow and memory heavy

export const upscaleAvailable = (): boolean => existsSync(PYTHON) && existsSync(WEIGHTS);

export interface Upscaled { file: string; name: string; width: number; height: number; cached: boolean }

/** The GPU takes one photo at a time. */
let queue: Promise<unknown> = Promise.resolve();

export function upscaleName(sourceName: string): string {
  const ext = extname(sourceName);
  return `${basename(sourceName, ext)}.x2.jpg`;
}

export function upscalePhoto(file: string, size: { width: number; height: number }, outputDir = dirname(file), sourceName = file): Promise<Upscaled> {
  const run = async (): Promise<Upscaled> => {
    if (!upscaleAvailable()) throw new Error('photo enhancement is not installed (.reelsmith-venv or the model weights are missing)');
    if (Math.max(size.width, size.height) > MAX_SOURCE_PX) throw new Error('photo is already large enough');
    // (a referenced import lives outside uploads: the copy goes to `outputDir`, named after its upload entry)
    const name = upscaleName(basename(sourceName));
    const out = join(outputDir, name);
    const result = { file: out, name, width: size.width * 2, height: size.height * 2, cached: true };
    if (existsSync(out) && (await stat(out)).mtimeMs >= (await stat(file)).mtimeMs) return result;
    await new Promise<void>((resolve, reject) => {
      execFile(PYTHON, [SCRIPT, file, out], { timeout: 180_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) { reject(new Error(`upscale failed: ${(stderr || error.message).slice(-300)}`)); return; }
        try {
          const info = JSON.parse(stdout.trim().split('\n').pop() ?? '{}') as { width?: number; height?: number };
          if (info.width && info.height) { result.width = info.width; result.height = info.height; }
        } catch { /* keep the computed size */ }
        resolve();
      });
    });
    return { ...result, cached: false };
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}
